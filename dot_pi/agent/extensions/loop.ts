/**
 * Loop Extension
 *
 * Provides a /loop command that starts a follow-up loop with a breakout condition.
 * The loop sends a prompt on turn end until the agent calls the
 * signal_loop_success tool or the configured turn budget is exhausted.
 */

import { Type } from "typebox";
import { complete } from "@earendil-works/pi-ai/compat";
import type { Api, Model, UserMessage } from "@earendil-works/pi-ai";
import { providerHeadersToRecord } from "@earendil-works/pi-ai/utils/headers";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compact } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";

type LoopMode = "tests" | "custom";

type LoopStateData = {
	active: boolean;
	mode?: LoopMode;
	condition?: string;
	validationCommand?: string;
	maxTurns?: number;
	prompt?: string;
	summary?: string;
	loopCount?: number;
};

const LOOP_PRESETS = [
	{ value: "tests", label: "Until exact check passes", description: "(command + turn budget)" },
	{ value: "custom", label: "Until custom condition", description: "(proof command + turn budget)" },
] as const;

const LOOP_STATE_ENTRY = "loop-state";

const HAIKU_MODEL_ID = "claude-haiku-4-5";

const SUMMARY_SYSTEM_PROMPT = `You summarize loop breakout conditions for a status widget.
Return a concise phrase (max 6 words) that says when the loop should stop.
Use plain text only, no quotes, no punctuation, no prefix.

Form should be "breaks when ...", "loops until ...", "stops on ...", "runs until ...", or similar.
Use the best form that makes sense for the loop condition.
`;

function buildPrompt(
	mode: LoopMode,
	validationCommand: string,
	maxTurns: number,
	condition?: string,
): string {
	const proofInstructions =
		`Use this exact validation command as proof; do not substitute a different or broader command:\n${validationCommand}\n\n` +
		"Before signaling success, run that command, rerun any separate original symptom or acceptance check, " +
		"and inspect the final diff for weakened, skipped, or deleted tests. Do not change expected behavior or tests merely to get a pass. " +
		`This loop stops after ${maxTurns} assistant turns if success is not signaled.`;

	switch (mode) {
		case "tests":
			return (
				`${proofInstructions}\n\n` +
				"Call the signal_loop_success tool only after the command exits successfully and the final checks are complete. " +
				"Otherwise continue only while the next step can change the result."
			);
		case "custom": {
			const customCondition = condition?.trim() || "the custom condition is satisfied";
			return (
				`Continue only while the next step can satisfy this condition: ${customCondition}.\n\n${proofInstructions}\n\n` +
				"Call the signal_loop_success tool only when both the condition and proof are satisfied."
			);
		}
	}
}

function summarizeCondition(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return "validation passes";
		case "custom": {
			const summary = condition?.trim() || "custom condition";
			return summary.length > 48 ? `${summary.slice(0, 45)}...` : summary;
		}
	}
}

function getConditionText(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return "validation passes";
		case "custom":
			return condition?.trim() || "custom condition";
	}
}

async function selectSummaryModel(
	ctx: ExtensionContext,
): Promise<{ model: Model<Api>; apiKey: string; headers?: Record<string, string> } | null> {
	if (!ctx.model) return null;

	if (ctx.model.provider === "anthropic") {
		const haikuModel = ctx.modelRegistry.find("anthropic", HAIKU_MODEL_ID);
		if (haikuModel) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(haikuModel);
			if (auth.ok && auth.apiKey) {
				return { model: haikuModel, apiKey: auth.apiKey, headers: providerHeadersToRecord(auth.headers) };
			}
		}
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return null;
	return { model: ctx.model, apiKey: auth.apiKey, headers: providerHeadersToRecord(auth.headers) };
}

async function summarizeBreakoutCondition(
	ctx: ExtensionContext,
	mode: LoopMode,
	condition?: string,
): Promise<string> {
	const fallback = summarizeCondition(mode, condition);
	const selection = await selectSummaryModel(ctx);
	if (!selection) return fallback;

	const conditionText = getConditionText(mode, condition);
	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: conditionText }],
		timestamp: Date.now(),
	};

	const response = await complete(
		selection.model,
		{ systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: selection.apiKey, headers: selection.headers, signal: ctx.signal },
	);

	if (response.stopReason === "aborted" || response.stopReason === "error") {
		return fallback;
	}

	const summary = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (!summary) return fallback;
	return summary.length > 60 ? `${summary.slice(0, 57)}...` : summary;
}

function getCompactionInstructions(state: LoopStateData): string {
	const conditionText = state.mode ? getConditionText(state.mode, state.condition) : "unknown";
	return (
		`Loop active. Breakout condition: ${conditionText}. ` +
		`Validation command: ${state.validationCommand ?? "missing"}. ` +
		`Turn budget: ${state.maxTurns ?? "missing"}. ` +
		"Preserve this loop state, proof, and budget in the summary."
	);
}

function parsePositiveInteger(value: string): number | null {
	if (!/^\d+$/.test(value.trim())) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isConfiguredLoop(state: LoopStateData): state is LoopStateData & {
	mode: LoopMode;
	validationCommand: string;
	maxTurns: number;
	prompt: string;
} {
	return Boolean(
		state.active &&
		state.mode &&
		state.validationCommand?.trim() &&
		state.maxTurns &&
		state.maxTurns > 0 &&
		state.prompt,
	);
}

function updateStatus(ctx: ExtensionContext, state: LoopStateData): void {
	if (!ctx.hasUI) return;
	if (!state.active || !state.mode) {
		ctx.ui.setWidget("loop", undefined);
		return;
	}
	const loopCount = state.loopCount ?? 0;
	const turnText = state.maxTurns ? `(turn ${loopCount}/${state.maxTurns})` : `(turn ${loopCount})`;
	const summary = state.summary?.trim();
	const text = summary
		? `Loop active: ${summary} ${turnText}`
		: `Loop active ${turnText}`;
	ctx.ui.setWidget("loop", [ctx.ui.theme.fg("accent", text)]);
}

async function loadState(ctx: ExtensionContext): Promise<LoopStateData> {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as { type: string; customType?: string; data?: LoopStateData };
		if (entry.type === "custom" && entry.customType === LOOP_STATE_ENTRY && entry.data) {
			return entry.data;
		}
	}
	return { active: false };
}

export default function loopExtension(pi: ExtensionAPI): void {
	let loopState: LoopStateData = { active: false };

	function persistState(state: LoopStateData): void {
		pi.appendEntry(LOOP_STATE_ENTRY, state);
	}

	function setLoopState(state: LoopStateData, ctx: ExtensionContext): void {
		loopState = state;
		persistState(state);
		updateStatus(ctx, state);
	}

	function clearLoopState(ctx: ExtensionContext): void {
		const cleared: LoopStateData = { active: false };
		loopState = cleared;
		persistState(cleared);
		updateStatus(ctx, cleared);
	}

	function breakLoop(ctx: ExtensionContext): void {
		clearLoopState(ctx);
		ctx.ui.notify("Loop ended", "info");
	}

	function wasLastAssistantAborted(messages: Array<{ role?: string; stopReason?: string }>): boolean {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message?.role === "assistant") {
				return message.stopReason === "aborted";
			}
		}
		return false;
	}

	function triggerLoopPrompt(ctx: ExtensionContext): void {
		if (!isConfiguredLoop(loopState)) {
			if (loopState.active) {
				clearLoopState(ctx);
				ctx.ui.notify("Loop stopped: missing proof command or turn budget", "warning");
			}
			return;
		}
		if (ctx.hasPendingMessages()) return;

		if ((loopState.loopCount ?? 0) >= loopState.maxTurns) {
			const maxTurns = loopState.maxTurns;
			clearLoopState(ctx);
			ctx.ui.notify(`Loop stopped after ${maxTurns} turns without success`, "warning");
			return;
		}

		const loopCount = (loopState.loopCount ?? 0) + 1;
		loopState = { ...loopState, loopCount };
		persistState(loopState);
		updateStatus(ctx, loopState);

		pi.sendMessage(
			{
				customType: "loop",
				content: `${loopState.prompt}\n\nLoop turn ${loopCount} of ${loopState.maxTurns}.`,
				display: true,
			},
			{
				deliverAs: "followUp",
				triggerTurn: true,
			},
		);
	}

	async function showLoopSelector(ctx: ExtensionContext): Promise<LoopStateData | null> {
		const items: SelectItem[] = LOOP_PRESETS.map((preset) => ({
			value: preset.value,
			label: preset.label,
			description: preset.description,
		}));

		const selection = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Select a loop preset"))));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});

			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);

			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "Press enter to confirm or esc to cancel")));
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

			return {
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selection) return null;

		async function getValidationCommand(): Promise<string | null> {
			const command = await ctx.ui.editor("Enter the exact validation command:", "");
			return command?.trim() || null;
		}

		async function getMaxTurns(): Promise<number | null> {
			const value = await ctx.ui.editor("Enter the maximum number of assistant turns:", "");
			if (!value?.trim()) return null;
			const maxTurns = parsePositiveInteger(value);
			if (!maxTurns) {
				ctx.ui.notify("Maximum turns must be a positive integer", "warning");
			}
			return maxTurns;
		}

		switch (selection) {
			case "tests": {
				const validationCommand = await getValidationCommand();
				if (!validationCommand) return null;
				const maxTurns = await getMaxTurns();
				if (!maxTurns) return null;
				return {
					active: true,
					mode: "tests",
					validationCommand,
					maxTurns,
					prompt: buildPrompt("tests", validationCommand, maxTurns),
				};
			}
			case "custom": {
				const condition = await ctx.ui.editor("Enter loop breakout condition:", "");
				if (!condition?.trim()) return null;
				const validationCommand = await getValidationCommand();
				if (!validationCommand) return null;
				const maxTurns = await getMaxTurns();
				if (!maxTurns) return null;
				return {
					active: true,
					mode: "custom",
					condition: condition.trim(),
					validationCommand,
					maxTurns,
					prompt: buildPrompt("custom", validationCommand, maxTurns, condition.trim()),
				};
			}
			default:
				return null;
		}
	}

	function parseArgs(args: string | undefined): LoopStateData | null {
		if (!args?.trim()) return null;
		const trimmed = args.trim();
		const testsMatch = trimmed.match(/^tests\s+(\d+)\s+(.+)$/s);
		if (testsMatch) {
			const maxTurns = parsePositiveInteger(testsMatch[1] ?? "");
			const validationCommand = testsMatch[2]?.trim();
			if (!maxTurns || !validationCommand) return null;
			return {
				active: true,
				mode: "tests",
				validationCommand,
				maxTurns,
				prompt: buildPrompt("tests", validationCommand, maxTurns),
			};
		}

		const customMatch = trimmed.match(/^custom\s+(\d+)\s+(.+?)\s+::\s+(.+)$/s);
		if (!customMatch) return null;
		const maxTurns = parsePositiveInteger(customMatch[1] ?? "");
		const condition = customMatch[2]?.trim();
		const validationCommand = customMatch[3]?.trim();
		if (!maxTurns || !condition || !validationCommand) return null;
		return {
			active: true,
			mode: "custom",
			condition,
			validationCommand,
			maxTurns,
			prompt: buildPrompt("custom", validationCommand, maxTurns, condition),
		};
	}

	pi.registerTool({
		name: "signal_loop_success",
		label: "Signal Loop Success",
		description: "Stop the active loop when the breakout condition is satisfied. Only call this tool when explicitly instructed to do so by the user, tool or system prompt.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!loopState.active) {
				return {
					content: [{ type: "text", text: "No active loop is running." }],
					details: { active: false },
				};
			}

			clearLoopState(ctx);

			return {
				content: [{ type: "text", text: "Loop ended." }],
				details: { active: false },
			};
		},
	});

	pi.registerCommand("loop", {
		description: "Start a proof-driven follow-up loop with a turn budget",
		handler: async (args, ctx) => {
			let nextState = parseArgs(args);
			if (!nextState) {
				if (!ctx.hasUI) {
					ctx.ui.notify(
						"Usage: /loop tests <max-turns> <command> | /loop custom <max-turns> <condition> :: <command>",
						"warning",
					);
					return;
				}
				nextState = await showLoopSelector(ctx);
			}

			if (!nextState) {
				ctx.ui.notify("Loop cancelled", "info");
				return;
			}

			if (loopState.active) {
				const confirm = ctx.hasUI
					? await ctx.ui.confirm("Replace active loop?", "A loop is already active. Replace it?")
					: true;
				if (!confirm) {
					ctx.ui.notify("Loop unchanged", "info");
					return;
				}
			}

			const summarizedState: LoopStateData = { ...nextState, summary: undefined, loopCount: 0 };
			setLoopState(summarizedState, ctx);
			ctx.ui.notify("Loop active", "info");
			triggerLoopPrompt(ctx);

			const mode = nextState.mode!;
			const condition = nextState.condition;
			void (async () => {
				const summary = await summarizeBreakoutCondition(ctx, mode, condition);
				if (!loopState.active || loopState.mode !== mode || loopState.condition !== condition) return;
				loopState = { ...loopState, summary };
				persistState(loopState);
				updateStatus(ctx, loopState);
			})();
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!loopState.active) return;

		if (ctx.hasUI && wasLastAssistantAborted(event.messages)) {
			const confirm = await ctx.ui.confirm(
				"Break active loop?",
				"Operation aborted. Break out of the loop?",
			);
			if (confirm) {
				breakLoop(ctx);
				return;
			}
		}

		triggerLoopPrompt(ctx);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (!loopState.active || !loopState.mode || !ctx.model) return;

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok || !auth.apiKey) return;
		const headers = providerHeadersToRecord(auth.headers);

		const instructionParts = [event.customInstructions, getCompactionInstructions(loopState)]
			.filter(Boolean)
			.join("\n\n");

		try {
			const compaction = await compact(
				event.preparation,
				ctx.model,
				auth.apiKey,
				headers,
				instructionParts || undefined,
				event.signal,
			);
			return { compaction };
		} catch (error) {
			if (ctx.hasUI) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Loop compaction failed: ${message}`, "warning");
			}
			return;
		}
	});

	async function restoreLoopState(ctx: ExtensionContext): Promise<void> {
		loopState = await loadState(ctx);
		if (loopState.active && !isConfiguredLoop(loopState)) {
			clearLoopState(ctx);
			ctx.ui.notify("Previous loop cleared because it had no proof command or turn budget", "warning");
			return;
		}
		updateStatus(ctx, loopState);

		if (loopState.active && loopState.mode && !loopState.summary) {
			const mode = loopState.mode;
			const condition = loopState.condition;
			void (async () => {
				const summary = await summarizeBreakoutCondition(ctx, mode, condition);
				if (!loopState.active || loopState.mode !== mode || loopState.condition !== condition) return;
				loopState = { ...loopState, summary };
				persistState(loopState);
				updateStatus(ctx, loopState);
			})();
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await restoreLoopState(ctx);
	});
}
