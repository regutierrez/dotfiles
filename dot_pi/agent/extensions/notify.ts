/**
 * Desktop Notification Extension
 *
 * Sends a native desktop notification when the agent finishes and is waiting for input.
 * Uses native desktop notifications on macOS and Linux. Falls back to terminal
 * escape sequences for remote/tmux sessions where a supported local terminal can
 * surface the notification.
 *
 * Terminal fallback support: Ghostty, iTerm2, WezTerm, rxvt-unicode.
 */

import { execFile } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Strip control characters and OSC delimiters that would break the terminal
 * control sequence payload.
 */
const sanitizeOscField = (value: string): string =>
	value
		.replace(/[\x00-\x1f\x7f]/g, " ")
		.replace(/;/g, ":")
		.replace(/\s+/g, " ")
		.trim();

const execFileAsync = promisify(execFile);

const appleScriptString = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const getMacOsNotificationBundleId = (): string | null => {
	if (process.env.PI_NOTIFY_MACOS_BUNDLE_ID) {
		return process.env.PI_NOTIFY_MACOS_BUNDLE_ID;
	}

	if (process.env.GHOSTTY_RESOURCES_DIR || process.env.TERM_PROGRAM === "Ghostty") {
		return "com.mitchellh.ghostty";
	}

	switch (process.env.TERM_PROGRAM) {
		case "iTerm.app":
			return "com.googlecode.iterm2";
		case "WezTerm":
			return "com.github.wez.wezterm";
		case "Apple_Terminal":
			return "com.apple.Terminal";
		default:
			return null;
	}
};

const notifyViaTerminalNotifier = async (title: string, body: string, bundleId: string | null): Promise<boolean> => {
	if (!bundleId) {
		return false;
	}

	const args = ["-title", title, "-message", body || title, "-activate", bundleId, "-group", "pi-agent"];
	for (const command of ["terminal-notifier", "/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"]) {
		try {
			await execFileAsync(command, args, { timeout: 2000 });
			return true;
		} catch {
			// Try the next common install path.
		}
	}

	return false;
};

/**
 * Send a real macOS Notification Center toast. Disable with
 * PI_NOTIFY_NATIVE=false to force the terminal OSC fallback.
 *
 * Click-to-activate needs terminal-notifier. osascript can show a toast, but
 * macOS does not let it attach a reliable click action.
 */
const notifyViaMacOs = async (title: string, body: string): Promise<boolean> => {
	if (process.platform !== "darwin" || process.env.PI_NOTIFY_NATIVE === "false") {
		return false;
	}

	const bundleId = getMacOsNotificationBundleId();
	if (await notifyViaTerminalNotifier(title, body, bundleId)) {
		return true;
	}

	const notificationBody = body || title;
	const notificationTitle = title === notificationBody ? "π" : title;
	const script = `display notification ${appleScriptString(notificationBody)} with title ${appleScriptString(notificationTitle)}`;

	try {
		await execFileAsync("osascript", ["-e", script], { timeout: 2000 });
		return true;
	} catch {
		return false;
	}
};

/**
 * Send a Linux desktop notification through libnotify. This works on common
 * Wayland/X11 desktops when notify-send has access to the user's DBus session.
 */
const notifyViaLinux = async (title: string, body: string): Promise<boolean> => {
	if (process.platform !== "linux" || process.env.PI_NOTIFY_NATIVE === "false") {
		return false;
	}

	try {
		await execFileAsync("notify-send", ["--app-name", "Pi", title, body], { timeout: 2000 });
		return true;
	} catch {
		try {
			await execFileAsync("notify-send", [title, body], { timeout: 2000 });
			return true;
		} catch {
			return false;
		}
	}
};

const notifyViaNativeDesktop = async (title: string, body: string): Promise<boolean> =>
	(await notifyViaMacOs(title, body)) || (await notifyViaLinux(title, body));

/**
 * tmux swallows many OSC sequences unless they are wrapped in a DCS passthrough
 * envelope. With `set -g allow-passthrough all`, this forwards the notification
 * to the *local* terminal emulator even when Pi is running in tmux.
 */
const wrapForTmux = (sequence: string): string => {
	if (!process.env.TMUX) {
		return sequence;
	}

	return `\x1bPtmux;${sequence.replace(/\x1b/g, "\x1b\x1b")}\x1b\\`;
};

/**
 * Write terminal control bytes to the real terminal. Pi can run with stdout
 * piped through RPC/websocket transports even when it still has a controlling
 * terminal, so fall back to /dev/tty before giving up.
 */
const writeTerminalControl = (sequence: string): boolean => {
	const payload = wrapForTmux(sequence);

	if (process.stdout.isTTY) {
		process.stdout.write(payload);
		return true;
	}

	try {
		const fd = openSync("/dev/tty", "w");
		try {
			writeSync(fd, payload);
			return true;
		} finally {
			closeSync(fd);
		}
	} catch {
		return false;
	}
};

/**
 * Send a desktop notification via OSC 777 escape sequence.
 */
const notifyViaTerminalOsc777 = (title: string, body: string): boolean => {
	const safeTitle = sanitizeOscField(title);
	const safeBody = sanitizeOscField(body);
	// OSC 777 format: ESC ] 777 ; notify ; title ; body BEL
	return writeTerminalControl(`\x1b]777;notify;${safeTitle};${safeBody}\x07`);
};

const isTextPart = (part: unknown): part is { type: "text"; text: string } =>
	Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part);

const extractLastAssistantText = (messages: Array<{ role?: string; content?: unknown }>): string | null => {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant") {
			continue;
		}

		const content = message.content;
		if (typeof content === "string") {
			return content.trim() || null;
		}

		if (Array.isArray(content)) {
			const text = content.filter(isTextPart).map((part) => part.text).join("\n").trim();
			return text || null;
		}

		return null;
	}

	return null;
};

const simplifyMarkdown = (text: string): string =>
	text
		.replace(/```[\s\S]*?```/g, " code block ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!?\[([^\]]+)]\([^)]*\)/g, "$1")
		.replace(/[*_~>#-]/g, " ");

const formatNotification = (text: string | null): { title: string; body: string } => {
	const simplified = text ? simplifyMarkdown(text) : "";
	const normalized = simplified.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return { title: "Ready for input", body: "" };
	}

	const maxBody = 200;
	const body = normalized.length > maxBody ? `${normalized.slice(0, maxBody - 1)}...` : normalized;
	return { title: "π", body };
};

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (event, ctx: ExtensionContext) => {
		const lastText = extractLastAssistantText(event.messages ?? []);
		const { title, body } = formatNotification(lastText);

		if (await notifyViaNativeDesktop(title, body)) {
			return;
		}

		// Terminal fallback. This works over SSH because the escape sequence is
		// interpreted by the local terminal emulator. tmux passthrough keeps it
		// working inside remote tmux.
		if (notifyViaTerminalOsc777(title, body)) {
			return;
		}

		// RPC mode / no controlling terminal fallback: route through Pi's extension
		// UI protocol so a local client can decide how to surface the notification.
		if (ctx.hasUI) {
			ctx.ui.notify(body || title, "info");
		}
	});
}
