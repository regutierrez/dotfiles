/**
 * `/herdr-rename` sets the Herdr Agents-panel display-agent comment.
 * Auto-renames on the first TUI prompt. No LLM tool, so the model cannot
 * call herdr_rename mid-session. Default model is GPT-5.6 Luna with low
 * reasoning. No-op outside Herdr.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UserMessage } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildHerdrDisplayAgentReportArgs,
	clipHerdrRenamePrompt,
	extractLatestUserPromptText,
	fallbackHerdrDisplayAgent,
	HERDR_RENAME_DEFAULT_THINKING,
	HERDR_RENAME_SYSTEM_PROMPT,
	normalizeHerdrDisplayAgent,
	parseHerdrRenameCommand,
	resolveHerdrRenamePaneEnv,
	selectHerdrRenameModel,
} from "./herdr-display-agent.ts";

const execFileAsync = promisify(execFile);

type RenameContext = Pick<ExtensionContext, "modelRegistry" | "sessionManager" | "signal" | "hasUI" | "ui" | "mode">;

export default function herdrRenameExtension(pi: ExtensionAPI): void {
	let autoRenamedThisSession = false;

	pi.on("session_start", () => {
		autoRenamedThisSession = false;
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (autoRenamedThisSession) return;
		if (ctx.mode !== "tui") return;
		const prompt = event.prompt?.trim();
		if (!prompt) return;
		if (!resolveHerdrRenamePaneEnv(process.env).ok) return;
		autoRenamedThisSession = true;
		void renameHerdrDisplayAgent({ ctx, prompt, notify: false }).catch(() => {});
	});

	pi.registerCommand("herdr-rename", {
		description: "Set the Herdr Agents-panel comment (Luna low, or a literal comment; --clear)",
		getArgumentCompletions: (argumentPrefix) => {
			const typed = argumentPrefix.trimStart();
			if ("--clear".startsWith(typed) || typed.length === 0) {
				return [{ value: "--clear", label: "--clear", description: "clear the display-agent comment" }];
			}
			return null;
		},
		handler: async (args, ctx) => {
			const parsed = parseHerdrRenameCommand(args);
			if (parsed.action === "error") {
				ctx.ui.notify(parsed.message, "error");
				return;
			}
			if (parsed.action === "clear") {
				autoRenamedThisSession = true;
				await clearHerdrDisplayAgent(ctx);
				return;
			}
			if (parsed.action === "set") {
				autoRenamedThisSession = true;
				await renameHerdrDisplayAgent({ ctx, comment: parsed.comment, notify: true });
				return;
			}
			autoRenamedThisSession = true;
			await renameHerdrDisplayAgent({ ctx, notify: true });
		},
	});
}

async function clearHerdrDisplayAgent(ctx: RenameContext): Promise<string> {
	const pane = resolveHerdrRenamePaneEnv(process.env);
	if (pane.ok === false) {
		notifyRename(ctx, pane.reason, "warning");
		return pane.reason;
	}
	try {
		await reportHerdrDisplayAgent(pane.herdrBin, buildHerdrDisplayAgentReportArgs({
			paneId: pane.paneId,
			action: "clear",
		}));
	} catch (error) {
		const message = `herdr-rename: pane report-metadata failed: ${error instanceof Error ? error.message : String(error)}`;
		notifyRename(ctx, message, "error");
		return message;
	}
	const message = "herdr-rename: cleared display-agent comment";
	notifyRename(ctx, message, "info");
	return message;
}

async function renameHerdrDisplayAgent(options: {
	ctx: RenameContext;
	comment?: string;
	prompt?: string;
	notify: boolean;
}): Promise<string> {
	const pane = resolveHerdrRenamePaneEnv(process.env);
	if (pane.ok === false) {
		if (options.notify) notifyRename(options.ctx, pane.reason, "warning");
		return pane.reason;
	}

	let displayAgent = options.comment ? normalizeHerdrDisplayAgent(options.comment) : undefined;
	if (!displayAgent) {
		const prompt = options.prompt?.trim() || extractLatestUserPromptText(options.ctx.sessionManager.getEntries());
		if (!prompt) {
			const message = "herdr-rename: no user prompt to summarize";
			if (options.notify) notifyRename(options.ctx, message, "warning");
			return message;
		}
		displayAgent = await summarizeHerdrDisplayAgent(options.ctx, prompt);
	}

	if (!displayAgent) {
		const message = "herdr-rename: display-agent comment is empty";
		if (options.notify) notifyRename(options.ctx, message, "warning");
		return message;
	}

	try {
		await reportHerdrDisplayAgent(pane.herdrBin, buildHerdrDisplayAgentReportArgs({
			paneId: pane.paneId,
			action: "set",
			displayAgent,
		}));
	} catch (error) {
		const message = `herdr-rename: pane report-metadata failed: ${error instanceof Error ? error.message : String(error)}`;
		if (options.notify) notifyRename(options.ctx, message, "error");
		return message;
	}

	const message = `herdr-rename: ${displayAgent}`;
	if (options.notify) notifyRename(options.ctx, message, "info");
	return message;
}

async function summarizeHerdrDisplayAgent(ctx: RenameContext, prompt: string): Promise<string | undefined> {
	const fallback = fallbackHerdrDisplayAgent(prompt);
	const selection = selectHerdrRenameModel(ctx.modelRegistry);
	if ("error" in selection) return fallback;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(selection.model);
	if (!auth.ok) return fallback;

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: clipHerdrRenamePrompt(prompt) }],
		timestamp: Date.now(),
	};

	try {
		const response = await complete(
			selection.model,
			{ systemPrompt: HERDR_RENAME_SYSTEM_PROMPT, messages: [userMessage] },
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				signal: ctx.signal,
				reasoningEffort: HERDR_RENAME_DEFAULT_THINKING,
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
		return normalizeHerdrDisplayAgent(summary) ?? fallback;
	} catch {
		return fallback;
	}
}

async function reportHerdrDisplayAgent(herdrBin: string, args: string[]): Promise<void> {
	await execFileAsync(herdrBin, args, { encoding: "utf8" });
}

function notifyRename(ctx: RenameContext, message: string, level: "info" | "warning" | "error"): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, level);
}
