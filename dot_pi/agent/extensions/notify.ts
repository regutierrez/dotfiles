/**
 * Desktop Notification Extension
 *
 * Sends a native desktop notification when the agent finishes and is waiting for input.
 * Uses terminal escape sequences so notifications can still appear on the
 * local machine when Pi is running remotely over SSH.
 *
 * Supported terminals: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * Not supported: Kitty (uses OSC 99), Terminal.app, Windows Terminal, Alacritty
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Markdown, type MarkdownTheme } from "@mariozechner/pi-tui";

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

/**
 * tmux swallows many OSC sequences unless they are wrapped in a DCS passthrough
 * envelope. With `set -g allow-passthrough on`, this forwards the notification
 * to the *local* terminal emulator even though Pi is running remotely.
 */
const wrapForTmux = (sequence: string): string => {
	if (!process.env.TMUX) {
		return sequence;
	}

	return `\x1bPtmux;${sequence.replace(/\x1b/g, "\x1b\x1b")}\x1b\\`;
};

/**
 * Send a desktop notification via OSC 777 escape sequence.
 */
const notifyViaTerminalOsc777 = (title: string, body: string, sound: boolean): void => {
	const safeTitle = sanitizeOscField(title);
	const safeBody = sanitizeOscField(body);
	// OSC 777 format: ESC ] 777 ; notify ; title ; body BEL
	const sequence = `\x1b]777;notify;${safeTitle};${safeBody}\x07`;
	process.stdout.write(wrapForTmux(sequence));
	if (sound) {
		process.stdout.write(wrapForTmux("\x07"));
	}
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

const plainMarkdownTheme: MarkdownTheme = {
	heading: (text) => text,
	link: (text) => text,
	linkUrl: () => "",
	code: (text) => text,
	codeBlock: (text) => text,
	codeBlockBorder: () => "",
	quote: (text) => text,
	quoteBorder: () => "",
	hr: () => "",
	listBullet: () => "",
	bold: (text) => text,
	italic: (text) => text,
	strikethrough: (text) => text,
	underline: (text) => text,
};

const simpleMarkdown = (text: string, width = 80): string => {
	const markdown = new Markdown(text, 0, 0, plainMarkdownTheme);
	return markdown.render(width).join("\n");
};

const formatNotification = (text: string | null): { title: string; body: string } => {
	const simplified = text ? simpleMarkdown(text) : "";
	const normalized = simplified.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return { title: "Ready for input", body: "" };
	}

	const maxBody = 200;
	const body = normalized.length > maxBody ? `${normalized.slice(0, maxBody - 1)}…` : normalized;
	return { title: "π", body };
};

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (event, ctx: ExtensionContext) => {
		const lastText = extractLastAssistantText(event.messages ?? []);
		const { title, body } = formatNotification(lastText);

		// Interactive TTY mode: send a terminal-native desktop notification. This
		// works over SSH because the escape sequence is interpreted by the local
		// terminal emulator. tmux passthrough keeps it working inside remote tmux.
		if (process.stdout.isTTY) {
			const sound = process.env.PI_NOTIFY_SOUND !== "false";
			notifyViaTerminalOsc777(title, body, sound);
			return;
		}

		// RPC mode / non-TTY fallback: route through Pi's extension UI protocol so
		// a local client can decide how to surface the notification.
		if (ctx.hasUI) {
			ctx.ui.notify(body || title, "info");
		}
	});
}
