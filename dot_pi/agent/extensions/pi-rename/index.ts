/**
 * `/pi-rename` names the Pi session. `/pi-rename <name>` sets it, bare
 * `/pi-rename` summarizes the latest prompt (GPT-5.6 Luna, low reasoning), and
 * `/pi-rename --clear` clears it. The first TUI prompt inside Herdr renames
 * automatically. A `session_info_changed` listener mirrors every name change -
 * from this command, the auto rename, or Pi's built-in `/name` - onto the
 * Herdr Agents panel as `pi - <name>` display-agent metadata. No LLM tool, so
 * the model cannot call pi_rename mid-session. The command renames the session
 * anywhere; the auto rename and the Herdr mirror no-op outside Herdr.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UserMessage } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildHerdrDisplayAgentReportArgs,
	HERDR_LEGACY_METADATA_SOURCE,
	resolveHerdrPaneEnv,
} from "./herdr-agent-metadata.ts";
import {
	clipPiRenamePrompt,
	extractLatestUserPromptText,
	fallbackPiSessionName,
	normalizePiSessionName,
	parsePiRenameCommand,
	PI_RENAME_DEFAULT_THINKING,
	PI_RENAME_SYSTEM_PROMPT,
	selectPiRenameModel,
} from "./pi-session-name.ts";

const execFileAsync = promisify(execFile);

type RenameContext = Pick<ExtensionContext, "modelRegistry" | "sessionManager" | "signal" | "hasUI" | "ui" | "mode">;

export default function piRenameExtension(pi: ExtensionAPI): void {
	let autoRenamedThisSession = false;
	let clearedLegacyHerdrSource = false;

	pi.on("session_start", (_event, ctx) => {
		autoRenamedThisSession = false;
		if (ctx.mode !== "tui") return;
		const pane = resolveHerdrPaneEnv(process.env);
		if (pane.ok === false) return;
		// Re-sync the Agents panel with the session name on every start (also
		// after a Herdr restart) and retire pre-rename `user:herdr-rename` labels.
		const clearLegacy = !clearedLegacyHerdrSource;
		clearedLegacyHerdrSource = true;
		void (async () => {
			if (clearLegacy) {
				await reportSessionNameToHerdr(pane.herdrBin, pane.paneId, undefined, HERDR_LEGACY_METADATA_SOURCE);
			}
			await reportSessionNameToHerdr(pane.herdrBin, pane.paneId, pi.getSessionName());
		})().catch(() => {});
	});

	pi.on("session_info_changed", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		const pane = resolveHerdrPaneEnv(process.env);
		if (pane.ok === false) return;
		void reportSessionNameToHerdr(pane.herdrBin, pane.paneId, event.name).catch((error) => {
			notifyRename(ctx, `pi-rename: herdr metadata failed: ${errorText(error)}`, "warning");
		});
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (autoRenamedThisSession) return;
		if (ctx.mode !== "tui") return;
		const prompt = event.prompt?.trim();
		if (!prompt) return;
		if (!resolveHerdrPaneEnv(process.env).ok) return;
		autoRenamedThisSession = true;
		void (async () => {
			const name = await summarizePiSessionName(ctx, prompt);
			if (name) pi.setSessionName(name);
		})().catch(() => {});
	});

	pi.registerCommand("pi-rename", {
		description: "Rename the Pi session and Herdr Agents panel (Luna low, or a literal name; --clear)",
		getArgumentCompletions: (argumentPrefix) => {
			const typed = argumentPrefix.trimStart();
			if ("--clear".startsWith(typed) || typed.length === 0) {
				return [{ value: "--clear", label: "--clear", description: "clear the session name and panel label" }];
			}
			return null;
		},
		handler: async (args, ctx) => {
			const parsed = parsePiRenameCommand(args);
			if (parsed.action === "error") {
				ctx.ui.notify(parsed.message, "error");
				return;
			}
			autoRenamedThisSession = true;
			if (parsed.action === "clear") {
				pi.setSessionName("");
				notifyRename(ctx, "pi-rename: cleared session name", "info");
				return;
			}
			let name = parsed.action === "set" ? normalizePiSessionName(parsed.comment) : undefined;
			if (!name) {
				const prompt = extractLatestUserPromptText(ctx.sessionManager.getEntries());
				if (!prompt) {
					notifyRename(ctx, "pi-rename: no user prompt to summarize", "warning");
					return;
				}
				name = await summarizePiSessionName(ctx, prompt);
			}
			if (!name) {
				notifyRename(ctx, "pi-rename: session name is empty", "warning");
				return;
			}
			// session_info_changed mirrors the name onto the Herdr Agents panel.
			pi.setSessionName(name);
			notifyRename(ctx, `pi-rename: ${name}`, "info");
		},
	});
}

/**
 * Mirror a session name to the Herdr Agents panel: set `pi - <name>` metadata,
 * or clear the pane label when the name is empty. Pass `source` to report as
 * another metadata source (legacy cleanup).
 */
async function reportSessionNameToHerdr(
	herdrBin: string,
	paneId: string,
	sessionName: string | undefined,
	source?: string,
): Promise<void> {
	const args = sessionName
		? buildHerdrDisplayAgentReportArgs({ paneId, action: "set", displayAgent: sessionName, source })
		: buildHerdrDisplayAgentReportArgs({ paneId, action: "clear", source });
	await execFileAsync(herdrBin, args, { encoding: "utf8" });
}

/** Summarize a prompt into a session name with Luna; fall back to the clipped prompt. */
async function summarizePiSessionName(ctx: RenameContext, prompt: string): Promise<string | undefined> {
	const fallback = fallbackPiSessionName(prompt);
	const selection = selectPiRenameModel(ctx.modelRegistry);
	if ("error" in selection) return fallback;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(selection.model);
	if (!auth.ok) return fallback;

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: clipPiRenamePrompt(prompt) }],
		timestamp: Date.now(),
	};

	try {
		const response = await complete(
			selection.model,
			{ systemPrompt: PI_RENAME_SYSTEM_PROMPT, messages: [userMessage] },
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				signal: ctx.signal,
				reasoningEffort: PI_RENAME_DEFAULT_THINKING,
				maxTokens: 64,
			},
		);
		if (response.stopReason === "aborted" || response.stopReason === "error") {
			return fallback;
		}
		const summary = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join(" ");
		return normalizePiSessionName(summary) ?? fallback;
	} catch {
		return fallback;
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function notifyRename(ctx: RenameContext, message: string, level: "info" | "warning" | "error"): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, level);
}
