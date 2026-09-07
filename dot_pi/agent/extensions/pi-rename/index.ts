/**
 * `/pi-rename` generates a descriptive session name and a terse Herdr title in
 * one Luna call. Linear tickets take priority for the tab title in both profiles.
 * Literal names and Pi's `/name` use a ticket or the first four words for the tab.
 * Only metadata is reported: Auto Title owns tab renames and window numbers.
 */
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
	fallbackPiSessionTitles,
	parsePiRenameCommand,
	parsePiSessionTitles,
	PI_RENAME_DEFAULT_THINKING,
	PI_RENAME_SYSTEM_PROMPT,
	PI_RENAME_TITLES_ENTRY,
	restorePiSessionTitles,
	selectPiRenameModel,
	type PiSessionTitles,
} from "./pi-session-name.ts";

type RenameContext = Pick<ExtensionContext, "modelRegistry" | "sessionManager" | "signal" | "hasUI" | "ui" | "mode">;

/** Keep session names, sidebar labels and Auto Title metadata synchronized. */
export default function piRenameExtension(pi: ExtensionAPI): void {
	let autoRenamedThisSession = false;
	let titles: PiSessionTitles | undefined;
	let active = false;
	let generation = 0;
	let metadataQueue = Promise.resolve();

	function mirrorTitles(ctx: RenameContext, source?: string): Promise<void> {
		if (ctx.mode !== "tui") return Promise.resolve();
		const pane = resolveHerdrPaneEnv(process.env);
		if (!pane.ok) return Promise.resolve();
		const args = source || !titles
			? buildHerdrDisplayAgentReportArgs({ paneId: pane.paneId, action: "clear", source })
			: buildHerdrDisplayAgentReportArgs({
				paneId: pane.paneId, action: "set",
				displayAgent: titles.sessionName, tabTitle: titles.tabTitle,
			});
		// Preserve set/clear ordering even when names change during an API call.
		metadataQueue = metadataQueue.then(async () => {
			const result = await pi.exec(pane.herdrBin, args);
			if (result.code !== 0) throw new Error(result.stderr || `Herdr exited with status ${result.code}`);
		}).catch((error) => {
			notifyRename(ctx, `pi-rename: herdr metadata failed: ${errorText(error)}`, "warning");
		});
		return metadataQueue;
	}

	function setTitles(next: PiSessionTitles | undefined): void {
		titles = next;
		// session_info_changed saves and reports both names, even when the name is unchanged.
		pi.setSessionName(next?.sessionName ?? "");
	}

	pi.on("session_start", async (_event, ctx) => {
		active = true;
		generation += 1;
		const entries = ctx.sessionManager.getEntries();
		titles = restorePiSessionTitles(entries, pi.getSessionName());
		// Do not replace restored names, or undo an explicit clear after /reload.
		autoRenamedThisSession = Boolean(pi.getSessionName()) ||
			entries.some((entry) => entry.type === "custom" && entry.customType === PI_RENAME_TITLES_ENTRY);
		await mirrorTitles(ctx, HERDR_LEGACY_METADATA_SOURCE);
		await mirrorTitles(ctx);
	});

	pi.on("session_shutdown", async () => {
		active = false;
		generation += 1;
		await metadataQueue;
	});

	pi.on("session_info_changed", async (event, ctx) => {
		generation += 1;
		autoRenamedThisSession = true;
		if (titles?.sessionName !== event.name) {
			titles = event.name ? fallbackPiSessionTitles(event.name) : undefined;
		}
		pi.appendEntry(PI_RENAME_TITLES_ENTRY, titles ?? null);
		await mirrorTitles(ctx);
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (autoRenamedThisSession || ctx.mode !== "tui") return;
		const prompt = event.prompt?.trim();
		if (!prompt || !resolveHerdrPaneEnv(process.env).ok) return;
		autoRenamedThisSession = true;
		const request = ++generation;
		void summarizePiSessionTitles(ctx, prompt).then((next) => {
			// A manual rename, reload or session switch wins over an older model call.
			if (next && active && request === generation) setTitles(next);
		}).catch((error) => {
			if (active && request === generation) {
				notifyRename(ctx, `pi-rename: naming failed: ${errorText(error)}`, "warning");
			}
		});
	});

	pi.registerCommand("pi-rename", {
		description: "Name the Pi session and terse Herdr title (Luna low, literal name, or --clear)",
		getArgumentCompletions: (argumentPrefix) => {
			const typed = argumentPrefix.trimStart();
			return "--clear".startsWith(typed)
				? [{ value: "--clear", label: "--clear", description: "clear the session name, panel label and title metadata" }]
				: null;
		},
		handler: async (args, ctx) => {
			const parsed = parsePiRenameCommand(args);
			if (parsed.action === "error") {
				notifyRename(ctx, parsed.message, "error");
				return;
			}
			autoRenamedThisSession = true;
			const request = ++generation;
			if (parsed.action === "clear") {
				setTitles(undefined);
				notifyRename(ctx, "pi-rename: cleared session name and title metadata", "info");
				return;
			}
			let next = parsed.action === "set" ? fallbackPiSessionTitles(parsed.comment) : undefined;
			if (!next) {
				const prompt = extractLatestUserPromptText(ctx.sessionManager.getEntries());
				if (!prompt) {
					notifyRename(ctx, "pi-rename: no user prompt to summarize", "warning");
					return;
				}
				next = await summarizePiSessionTitles(ctx, prompt);
			}
			if (!active || request !== generation) return;
			if (!next) {
				notifyRename(ctx, "pi-rename: session name is empty", "warning");
				return;
			}
			setTitles(next);
			notifyRename(ctx, `pi-rename: ${next.sessionName} (tab: ${next.tabTitle})`, "info");
		},
	});
}

async function summarizePiSessionTitles(ctx: RenameContext, prompt: string): Promise<PiSessionTitles | undefined> {
	const fallback = fallbackPiSessionTitles(prompt);
	try {
		const selection = selectPiRenameModel(ctx.modelRegistry);
		if ("error" in selection) return fallback;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(selection.model);
		if (!auth.ok) return fallback;
		const userMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: clipPiRenamePrompt(prompt) }],
			timestamp: Date.now(),
		};
		const response = await complete(
			selection.model,
			{ systemPrompt: PI_RENAME_SYSTEM_PROMPT, messages: [userMessage] },
			{
				apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal,
				reasoningEffort: PI_RENAME_DEFAULT_THINKING,
			},
		);
		if (response.stopReason === "aborted" || response.stopReason === "error") return fallback;
		const text = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text).join(" ");
		return parsePiSessionTitles(text, prompt);
	} catch {
		return fallback;
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function notifyRename(ctx: RenameContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}
