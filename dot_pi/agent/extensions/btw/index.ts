import {
	buildSessionContext,
	createAgentSession,
	createExtensionRuntime,
	getAgentDir,
	getMarkdownTheme,
	SessionManager,
	type AgentSession,
	type ExtensionAPI,
	type ExtensionContext,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { Container, Markdown, Text, type Component } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGE_TYPE = "btw-thread";
const MAX_SLOTS = 9;
const COLLAPSED_ANSWER_LINES = 3;
const EXPANDED_ANSWER_LINES = 40;
const CONFIG_PATH = join(getAgentDir(), "btw.json");
const BTW_SYSTEM_PROMPT = [
	"You are BTW, a side-channel assistant embedded in the user's coding agent.",
	"You can see the main conversation context and the selected BTW thread.",
	"Answer the focused question directly without derailing the main task.",
	"Use read-only tools when repository evidence is needed.",
].join(" ");

type BtwTurn = {
	question: string;
	answer?: string;
	error?: string;
	startedAt: number;
	finishedAt?: number;
	status: "queued" | "running" | "answered" | "failed";
	turn: number;
};

type BtwSlot = {
	index: number;
	generation: string;
	turns: BtwTurn[];
	queue: Promise<void>;
	runtime?: AgentSession;
};

type BtwConfig = {
	model?: string;
	thinking?: ThinkingLevel;
};

type BtwRecord = {
	kind: "result" | "cleared";
	slot: number;
	generation: string;
	turn?: number;
	question?: string;
	answer?: string;
	error?: string;
	startedAt?: number;
	finishedAt?: number;
	clearedAt?: number;
};

function newGeneration(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readConfig(): { config: BtwConfig; warning?: string } {
	try {
		const value = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return { config: {}, warning: `${CONFIG_PATH} must contain a JSON object; inheriting the main model.` };
		}
		const record = value as Record<string, unknown>;
		return {
			config: {
				model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : undefined,
				thinking: typeof record.thinking === "string" ? (record.thinking as ThinkingLevel) : undefined,
			},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: {} };
		return {
			config: {},
			warning: `Could not read ${CONFIG_PATH}; inheriting the main model. ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function inheritedRuntimeOptions(modelRegistry: unknown): Record<string, unknown> {
	const runtime = (modelRegistry as { runtime?: unknown } | undefined)?.runtime;
	return runtime ? { modelRuntime: runtime } : { modelRegistry };
}

export function selectBtwModel(
	mainModel: Model<any> | undefined,
	configuredRef: string | undefined,
	registry: Pick<ExtensionContext["modelRegistry"], "find" | "hasConfiguredAuth">,
): { model: Model<any>; warning?: string } | undefined {
	if (!mainModel) return undefined;
	if (!configuredRef) return { model: mainModel };

	const separator = configuredRef.indexOf("/");
	if (separator <= 0 || separator === configuredRef.length - 1) {
		return {
			model: mainModel,
			warning: `Invalid BTW model ${JSON.stringify(configuredRef)}; using ${mainModel.provider}/${mainModel.id}.`,
		};
	}
	const provider = configuredRef.slice(0, separator);
	const modelId = configuredRef.slice(separator + 1);
	const configured = registry.find(provider, modelId);
	if (!configured || !registry.hasConfiguredAuth(configured)) {
		return {
			model: mainModel,
			warning: `BTW model ${configuredRef} is unavailable; using ${mainModel.provider}/${mainModel.id}.`,
		};
	}
	return { model: configured };
}

function stripDynamicSystemPromptFooter(systemPrompt: string): string {
	return systemPrompt
		.replace(/\nCurrent date and time:[^\n]*(?:\nCurrent working directory:[^\n]*)?$/u, "")
		.replace(/\nCurrent working directory:[^\n]*$/u, "")
		.trim();
}

function createBtwResourceLoader(ctx: ExtensionContext): ResourceLoader {
	const extensionsResult = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	const systemPrompt = stripDynamicSystemPromptFooter(ctx.getSystemPrompt());

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [BTW_SYSTEM_PROMPT],
		extendResources: () => {},
		reload: async () => {},
	};
}

function lastAssistant(session: AgentSession): AssistantMessage | undefined {
	for (let index = session.state.messages.length - 1; index >= 0; index--) {
		const message = session.state.messages[index];
		if (message.role === "assistant") return message as AssistantMessage;
	}
	return undefined;
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function commandForFork(sessionFile: string, name: string, handoff: string): string {
	return ["pi", "--fork", shellQuote(sessionFile), "--name", shellQuote(name), shellQuote(handoff)].join(" ");
}

function findStringByKey(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findStringByKey(item, key);
			if (found) return found;
		}
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (typeof record[key] === "string") return record[key];
	for (const item of Object.values(record)) {
		const found = findStringByKey(item, key);
		if (found) return found;
	}
	return undefined;
}

export type BtwLifecycleAction = "inject" | "clear" | "fork";

export type BtwCommand =
	| { action: "show" }
	| { action: "ask"; question: string; slot?: number }
	| { action: "select"; slot: number }
	| { action: BtwLifecycleAction; slot?: number }
	| { action: "error"; message: string };

/** Map a 1-based `/btw N` slot to the 0-based in-memory index. */
export function resolveBtwSlotIndex(slot: number | undefined, activeIndex: number): number {
	if (slot === undefined) return activeIndex;
	return slot - 1;
}

function parseSlotNumber(raw: string): number | { error: string } {
	const slot = Number(raw);
	if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SLOTS) {
		return { error: `BTW slots are 1 through ${MAX_SLOTS}.` };
	}
	return slot;
}

function lifecycleAction(raw: string): BtwLifecycleAction | undefined {
	if (raw === "inject" || raw === "fork") return raw;
	if (raw === "clear" || raw === "discard") return "clear";
	return undefined;
}

export function parseBtwCommand(args: string): BtwCommand {
	const trimmed = args.trim();
	if (!trimmed) return { action: "show" };

	// "inject", "inject 2", "discard 1", "fork 3"
	const actionFirst = trimmed.match(/^(inject|fork|clear|discard)(?:\s+(\d+))?$/u);
	if (actionFirst) {
		const action = lifecycleAction(actionFirst[1]!)!;
		if (!actionFirst[2]) return { action };
		const slot = parseSlotNumber(actionFirst[2]);
		if (typeof slot === "object") return { action: "error", message: slot.error };
		return { action, slot };
	}

	// Older UI labels looked like "BTW 2.1"; that is a turn id, not a slot command.
	if (/^\d+\.\d+/u.test(trimmed)) {
		return {
			action: "error",
			message: 'Use "/btw N question" with a space after the slot number (example: /btw 2 what broke?).',
		};
	}

	// Allow "/btw 2 q", "/btw #2 q", "/btw 2 inject". Require the number to be its own token.
	const numbered = trimmed.match(/^#?(\d+)(?:\s+([\s\S]+))?$/u);
	if (!numbered) return { action: "ask", question: trimmed };
	const slot = parseSlotNumber(numbered[1]!);
	if (typeof slot === "object") return { action: "error", message: slot.error };
	const rest = numbered[2]?.trim();
	if (!rest) return { action: "select", slot };
	const lifecycle = lifecycleAction(rest);
	if (lifecycle) return { action: lifecycle, slot };
	return { action: "ask", slot, question: rest };
}

function compactText(value: string, max = 70): string {
	const oneLine = value.replace(/\s+/gu, " ").trim();
	return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/** Collapse answer text for the compact BTW widget body. */
export function previewAnswer(value: string, maxLines = COLLAPSED_ANSWER_LINES, maxChars = 240): string {
	const normalized = value.replace(/\r\n/gu, "\n").trim();
	if (!normalized) return "";
	const lines = normalized.split("\n").map((line) => line.trimEnd());
	const preview = lines.slice(0, maxLines).join("\n");
	const lineTruncated = lines.length > maxLines;
	if (preview.length > maxChars) {
		return `${preview.slice(0, Math.max(0, maxChars - 1))}…`;
	}
	if (lineTruncated) return `${preview}
…`;
	return preview;
}

function completedTurns(slot: BtwSlot): BtwTurn[] {
	return slot.turns.filter((turn) => turn.answer || turn.error);
}

/** True when a stored BTW result still belongs to a live (not discarded) generation. */
export function shouldDisplayBtwRecord(
	record: Pick<BtwRecord, "kind" | "generation"> | undefined,
	clearedGenerations: ReadonlySet<string>,
): boolean {
	if (!record || record.kind === "cleared") return false;
	return !clearedGenerations.has(record.generation);
}

function limitComponent(component: Component, maxLines: number, overflowLine: string): Component {
	return {
		invalidate() {
			component.invalidate();
		},
		render(width: number) {
			const lines = component.render(width);
			if (lines.length <= maxLines) return lines;
			// Keep real content on screen. A 1-line budget must not collapse to only "…".
			if (maxLines <= 1) return lines.slice(0, 1);
			return [...lines.slice(0, maxLines - 1), overflowLine];
		},
	};
}

function prefixTextLines(text: string, prefix: string, color: (value: string) => string): string[] {
	const lines = text.length > 0 ? text.split("\n") : [""];
	return lines.map((line) => `${prefix}${color(line)}`);
}

function formatTurns(turns: BtwTurn[]): string {
	return turns
		.map(
			(turn, index) =>
				`Question ${index + 1}:\n${turn.question}\n\nAnswer ${index + 1}:\n${turn.answer ?? turn.error ?? "(no answer)"}`,
		)
		.join("\n\n---\n\n");
}

function injectionText(slot: BtwSlot): string {
	return [
		`Context from BTW slot ${slot.index + 1}:`,
		"",
		formatTurns(completedTurns(slot)),
		"",
		"Use this context while continuing the current task. Verify its conclusions against the repository when relevant.",
	].join("\n");
}

function promotionText(slot: BtwSlot): string {
	return [
		"The following side conversation occurred while working in the parent session.",
		"Continue it as a first-class task in this fork.",
		"",
		`BTW slot: ${slot.index + 1}`,
		"",
		formatTurns(completedTurns(slot)),
		"",
		"Continue from this discussion. Verify its conclusions against the repository before making changes.",
	].join("\n");
}

export default function btwExtension(pi: ExtensionAPI): void {
	let slots: Array<BtwSlot | undefined> = [];
	let activeIndex = 0;
	let answerExpanded = false;
	let lastContext: ExtensionContext | undefined;
	const clearedGenerations = new Set<string>();

	function listSlots(): BtwSlot[] {
		return slots.filter((slot): slot is BtwSlot => slot !== undefined);
	}

	function activeSlot(): BtwSlot | undefined {
		return slots[activeIndex];
	}

	function createSlot(index = slots.findIndex((slot) => !slot)): BtwSlot {
		if (index < 0) index = slots.length;
		if (index >= MAX_SLOTS) throw new Error(`BTW supports at most ${MAX_SLOTS} slots.`);
		const slot: BtwSlot = {
			index,
			generation: newGeneration(),
			turns: [],
			queue: Promise.resolve(),
		};
		while (slots.length <= index) slots.push(undefined);
		slots[index] = slot;
		activeIndex = index;
		return slot;
	}

	function ensureSlot(index = activeIndex): BtwSlot {
		if (!Number.isInteger(index) || index < 0 || index >= MAX_SLOTS) {
			throw new Error(`Use BTW slot 1 through ${MAX_SLOTS}.`);
		}
		const slot = slots[index] ?? createSlot(index);
		activeIndex = index;
		return slot;
	}

	function status(slot: BtwSlot): "running" | "failed" | "answered" | "ready" {
		if (slot.turns.some((turn) => turn.status === "queued" || turn.status === "running")) return "running";
		if (slot.turns.some((turn) => turn.status === "failed")) return "failed";
		if (completedTurns(slot).length > 0) return "answered";
		return "ready";
	}

	/** Focus an existing slot for actions; do not create empty slots. */
	function focusExistingSlot(index: number): BtwSlot | undefined {
		const slot = slots[index];
		if (!slot) return undefined;
		if (activeIndex !== index) answerExpanded = false;
		activeIndex = index;
		return slot;
	}

	function renderWidget(ctx: ExtensionContext): void {
		lastContext = ctx;
		const existing = listSlots();
		if (existing.length === 0) {
			answerExpanded = false;
			ctx.ui.setWidget("btw", undefined);
			return;
		}

		const active = activeSlot() ?? existing[0];
		activeIndex = active.index;
		// Expand/collapse and other actions target the selected (bracketed) slot only.
		const canExpand = completedTurns(active).some((turn) => Boolean(turn.answer || turn.error));
		if (!canExpand) answerExpanded = false;

		ctx.ui.setWidget(
			"btw",
			(_tui, theme) => {
				const container = new Container();
				const rail = theme.fg("muted", "│");
				// Header keeps only the selected marker — no "btw 1✓ [2]" soup.
				container.addChild(
					new Text(
						`${theme.fg("accent", "╭─ btw")} ${theme.fg("accent", `[${active.index + 1}]`)}`,
						0,
						0,
					),
				);

				// Color pattern:
				// - chrome/rails: muted
				// - selected marker [N]: accent
				// - idle markers: dim
				// - questions: bold warning (yellow)
				// - answers: text (white/readable; toolOutput is too gray)
				// - running/error: warning/error only on those lines
				for (const [slotPos, slot] of existing.entries()) {
					if (slotPos > 0) container.addChild(new Text(rail, 0, 0));

					const isActive = slot.index === activeIndex;
					const marker = isActive
						? theme.fg("accent", `[${slot.index + 1}]`)
						: theme.fg("dim", ` ${slot.index + 1} `);
					const done = completedTurns(slot);
					const latest = slot.turns.at(-1);
					const expandThis = isActive && answerExpanded;
					// Same collapsed budget for every slot so inactive answers are still readable.
					const collapsedLines = COLLAPSED_ANSWER_LINES;
					const collapsedChars = 240;
					// Visual indent under "│ [N] " / "│  N  ".
					const indent = `${rail}     `;
					const markdownPad = 6;

					const questionText = (question: string) => {
						const text = compactText(question, 100);
						// Yellow question; bold when this slot is selected.
						const painted = theme.fg("warning", text);
						return isActive ? theme.bold(painted) : painted;
					};

					const questionLine = (question: string, withMarker: boolean) =>
						new Text(
							withMarker ? `${rail} ${marker} ${questionText(question)}` : `${indent}${questionText(question)}`,
							0,
							0,
						);

					if (latest && (latest.status === "running" || latest.status === "queued")) {
						container.addChild(questionLine(latest.question, true));
						container.addChild(new Text(theme.fg("dim", `${indent}… thinking`), 0, 0));
						continue;
					}

					if (done.length === 0 && latest?.error) {
						container.addChild(questionLine(latest.question, true));
						container.addChild(
							new Text(`${indent}${theme.fg("error", compactText(latest.error, 100))}`, 0, 0),
						);
						continue;
					}

					if (done.length === 0) {
						container.addChild(new Text(`${rail} ${marker} ${theme.fg("dim", "(empty)")}`, 0, 0));
						continue;
					}

					const turns = expandThis ? done : done.slice(-1);
					for (const [turnPos, turn] of turns.entries()) {
						if (turnPos > 0) container.addChild(new Text(rail, 0, 0));
						// Slot marker only on the first visible turn of the slot.
						container.addChild(questionLine(turn.question, turnPos === 0));

						if (turn.error) {
							const body = expandThis
								? turn.error
								: previewAnswer(turn.error, collapsedLines, collapsedChars);
							for (const line of prefixTextLines(body, indent, (value) => theme.fg("error", value))) {
								container.addChild(new Text(line, 0, 0));
							}
							continue;
						}

						const answer = (turn.answer ?? "").trim();
						if (!answer) {
							container.addChild(new Text(`${indent}${theme.fg("dim", "(no answer)")}`, 0, 0));
							continue;
						}

						// Always render through Markdown so **bold** / *italic* / lists work
						// in both collapsed and expanded views (plain Text showed raw markers).
						const maxLines = expandThis ? EXPANDED_ANSWER_LINES : collapsedLines;
						const overflow = expandThis
							? `${indent}… truncated — inject or fork for the full answer`
							: `${indent}…`;
						const markdown = new Markdown(answer, markdownPad, 0, getMarkdownTheme(), {
							color: (value) => theme.fg("text", value),
						});
						container.addChild(limitComponent(markdown, maxLines, theme.fg("dim", overflow)));
					}
				}

				const expandHint = canExpand ? (answerExpanded ? "alt+o collapse · " : "alt+o expand · ") : "";
				container.addChild(
					new Text(
						theme.fg(
							"dim",
							`╰─ ${expandHint}alt+shift+j/k select · alt+z compose · alt+c inject · alt+x discard · alt+shift+f fork`,
						),
						0,
						0,
					),
				);
				return container;
			},
			{ placement: "aboveEditor" },
		);
	}

	function appendRecord(record: BtwRecord): void {
		// Persist for restore/inject/fork only. The widget owns on-screen presentation.
		pi.sendMessage(
			{
				customType: MESSAGE_TYPE,
				content: record.kind === "result" ? record.answer ?? record.error ?? "" : "",
				display: false,
				details: record,
			},
			{ triggerTurn: false, deliverAs: "followUp" },
		);
	}

	async function disposeSlotRuntime(slot: BtwSlot): Promise<void> {
		const runtime = slot.runtime;
		delete slot.runtime;
		if (!runtime) return;
		try {
			await runtime.abort();
		} catch {
			// Best-effort shutdown.
		}
		runtime.dispose();
	}

	async function clearSlot(ctx: ExtensionContext, slot = activeSlot()): Promise<void> {
		if (!slot) {
			ctx.ui.notify("No BTW slot to discard.", "warning");
			return;
		}
		// Mark first so in-flight turns drop output immediately.
		clearedGenerations.add(slot.generation);
		slots[slot.index] = undefined;
		answerExpanded = false;
		appendRecord({
			kind: "cleared",
			slot: slot.index + 1,
			generation: slot.generation,
			clearedAt: Date.now(),
		});
		await disposeSlotRuntime(slot);
		activeIndex = listSlots()[0]?.index ?? 0;
		renderWidget(ctx);
	}

	function toggleAnswerExpanded(ctx: ExtensionContext): void {
		const slot = activeSlot();
		if (!slot || completedTurns(slot).length === 0) {
			ctx.ui.notify("No BTW answer to expand.", "warning");
			return;
		}
		answerExpanded = !answerExpanded;
		renderWidget(ctx);
	}

	function buildSidePrompt(slot: BtwSlot, question: string): string {
		const history = completedTurns(slot);
		if (history.length === 0) return question;
		return [
			`BTW slot ${slot.index + 1} conversation so far:`,
			"",
			formatTurns(history),
			"",
			"New question:",
			question,
		].join("\n");
	}

	function isLiveTurn(slot: BtwSlot, generation: string): boolean {
		return (
			slot.generation === generation &&
			slots[slot.index] === slot &&
			!clearedGenerations.has(generation)
		);
	}

	async function runTurn(ctx: ExtensionContext, slot: BtwSlot, turn: BtwTurn): Promise<void> {
		const generation = slot.generation;
		if (!ctx.model || !isLiveTurn(slot, generation)) return;
		turn.status = "running";
		renderWidget(ctx);

		let session: AgentSession | undefined;
		try {
			const { config, warning: configWarning } = readConfig();
			const selection = selectBtwModel(ctx.model, config.model, ctx.modelRegistry);
			if (!selection) throw new Error("No active model selected.");
			const warning = configWarning ?? selection.warning;
			if (warning) ctx.ui.notify(warning, "warning");

			const result = await createAgentSession({
				cwd: ctx.cwd,
				sessionManager: SessionManager.inMemory(ctx.cwd),
				model: selection.model,
				...inheritedRuntimeOptions(ctx.modelRegistry),
				thinkingLevel: config.thinking ?? (pi.getThinkingLevel() as ThinkingLevel),
				tools: ["read", "grep", "find", "ls"],
				resourceLoader: createBtwResourceLoader(ctx),
			});
			session = result.session;
			slot.runtime = session;

			const mainMessages = buildSessionContext(
				ctx.sessionManager.getEntries(),
				ctx.sessionManager.getLeafId(),
			).messages.filter(
					(message) => !(message.role === "custom" && message.customType === MESSAGE_TYPE),
				);
			session.agent.state.messages = mainMessages as typeof session.agent.state.messages;
			await session.prompt(buildSidePrompt(slot, turn.question), { source: "extension" });

			if (!isLiveTurn(slot, generation)) return;
			const response = lastAssistant(session);
			if (!response) throw new Error("BTW finished without an answer.");
			if (response.stopReason === "error") throw new Error(response.errorMessage || "BTW failed.");
			if (response.stopReason === "aborted") throw new Error("BTW was aborted.");

			turn.answer = assistantText(response) || "(No text response)";
			turn.status = "answered";
			turn.finishedAt = Date.now();
			// Recheck after mutation: discard during finalization must drop the answer.
			if (!isLiveTurn(slot, generation)) return;
			appendRecord({
				kind: "result",
				slot: slot.index + 1,
				generation: slot.generation,
				turn: turn.turn,
				question: turn.question,
				answer: turn.answer,
				startedAt: turn.startedAt,
				finishedAt: turn.finishedAt,
			});
		} catch (error) {
			if (!isLiveTurn(slot, generation)) return;
			turn.error = error instanceof Error ? error.message : String(error);
			turn.status = "failed";
			turn.finishedAt = Date.now();
			if (!isLiveTurn(slot, generation)) return;
			appendRecord({
				kind: "result",
				slot: slot.index + 1,
				generation: slot.generation,
				turn: turn.turn,
				question: turn.question,
				error: turn.error,
				startedAt: turn.startedAt,
				finishedAt: turn.finishedAt,
			});
			ctx.ui.notify(`/btw failed: ${turn.error}`, "error");
		} finally {
			if (slot.runtime === session) delete slot.runtime;
			if (session) session.dispose();
			if (slots[slot.index] === slot) renderWidget(ctx);
		}
	}

	function queueQuestion(ctx: ExtensionContext, slot: BtwSlot, question: string): void {
		const turn: BtwTurn = {
			question,
			startedAt: Date.now(),
			status: "queued",
			turn: slot.turns.length + 1,
		};
		slot.turns.push(turn);
		renderWidget(ctx);
		slot.queue = slot.queue.catch(() => undefined).then(() => runTurn(ctx, slot, turn));
	}

	async function injectSlot(ctx: ExtensionContext): Promise<void> {
		const slot = activeSlot();
		if (!slot || completedTurns(slot).length === 0) {
			ctx.ui.notify("No BTW answers to inject.", "warning");
			return;
		}
		const message = injectionText(slot);
		await clearSlot(ctx, slot);
		pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
	}

	async function promoteSlot(ctx: ExtensionContext): Promise<void> {
		const slot = activeSlot();
		if (!slot || completedTurns(slot).length === 0) {
			ctx.ui.notify("No BTW answers to fork.", "warning");
			return;
		}
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) {
			ctx.ui.notify("Cannot fork an ephemeral Pi session.", "error");
			return;
		}

		const firstQuestion = completedTurns(slot)[0]?.question ?? `BTW ${slot.index + 1}`;
		const name = `BTW ${slot.index + 1}: ${compactText(firstQuestion, 42)}`;
		const command = commandForFork(sessionFile, name, promotionText(slot));

		if (process.env.HERDR_ENV === "1" && process.env.HERDR_WORKSPACE_ID) {
			const created = await pi.exec(
				"herdr",
				[
					"tab",
					"create",
					"--workspace",
					process.env.HERDR_WORKSPACE_ID,
					"--cwd",
					ctx.cwd,
					"--label",
					name,
					"--no-focus",
				],
				{ timeout: 10_000 },
			);
			if (created.code !== 0) {
				throw new Error(created.stderr.trim() || "Herdr failed to create a tab.");
			}
			let payload: unknown;
			try {
				payload = JSON.parse(created.stdout);
			} catch {
				throw new Error("Herdr returned invalid JSON while creating a tab.");
			}
			const paneId = findStringByKey(payload, "pane_id");
			if (!paneId) throw new Error("Herdr did not return a pane ID.");
			const launched = await pi.exec("herdr", ["pane", "run", paneId, command], { timeout: 10_000 });
			if (launched.code !== 0) {
				throw new Error(launched.stderr.trim() || "Herdr failed to start the forked Pi session.");
			}
			ctx.ui.notify(`Forked BTW ${slot.index + 1} into Herdr tab “${name}”.`, "info");
			return;
		}

		const copied = await pi.exec(
			"/bin/sh",
			["-c", 'printf %s "$1" | pbcopy', "btw", command],
			{ timeout: 5_000 },
		);
		if (copied.code !== 0) {
			ctx.ui.notify(`Could not copy command: ${copied.stderr.trim() || "pbcopy failed"}`, "error");
			return;
		}
		ctx.ui.notify(`Copied command to fork BTW ${slot.index + 1}; paste it into another terminal.`, "info");
	}

	function restore(ctx: ExtensionContext): void {
		slots = [];
		activeIndex = 0;
		answerExpanded = false;
		clearedGenerations.clear();
		const generations = new Map<string, { slot: number; generation: string; cleared: boolean; turns: BtwTurn[] }>();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom_message" || entry.customType !== MESSAGE_TYPE) continue;
			const record = entry.details as BtwRecord | undefined;
			if (!record || !Number.isInteger(record.slot) || record.slot < 1 || record.slot > MAX_SLOTS) continue;
			const key = `${record.slot}:${record.generation}`;
			const generation = generations.get(key) ?? {
				slot: record.slot,
				generation: record.generation,
				cleared: false,
				turns: [],
			};
			generations.set(key, generation);
			if (record.kind === "cleared") {
				generation.cleared = true;
				clearedGenerations.add(record.generation);
			} else if (record.question && (record.answer || record.error)) {
				generation.turns.push({
					question: record.question,
					answer: record.answer,
					error: record.error,
					startedAt: record.startedAt ?? Date.now(),
					finishedAt: record.finishedAt,
					status: record.error ? "failed" : "answered",
					turn: record.turn ?? generation.turns.length + 1,
				});
			}
		}
		for (const generation of generations.values()) {
			if (generation.cleared || generation.turns.length === 0) continue;
			const index = generation.slot - 1;
			slots[index] = {
				index,
				generation: generation.generation,
				turns: generation.turns.sort((a, b) => a.turn - b.turn),
				queue: Promise.resolve(),
			};
		}
		activeIndex = listSlots()[0]?.index ?? 0;
		renderWidget(ctx);
	}

	// Answers render in the widget. Keep this renderer only to hide legacy display:true rows.
	pi.registerMessageRenderer<BtwRecord>(MESSAGE_TYPE, () => ({
		invalidate() {},
		render: () => [],
	}));

	pi.on("context", (event) => {
		const messages = event.messages.filter(
			(message) => !(message.role === "custom" && message.customType === MESSAGE_TYPE),
		);
		return messages.length === event.messages.length ? undefined : { messages };
	});

	pi.on("session_start", async (_event, ctx) => restore(ctx));
	pi.on("session_tree", async (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", async () => {
		const currentSlots = listSlots();
		slots = [];
		answerExpanded = false;
		await Promise.all(currentSlots.map((slot) => disposeSlotRuntime(slot)));
		lastContext?.ui.setWidget("btw", undefined);
	});

	pi.registerCommand("btw", {
		description: "Ask a side question. /btw N selects; /btw N inject|discard|fork targets a slot.",
		handler: async (args, ctx) => {
			lastContext = ctx;
			const command = parseBtwCommand(args);
			if (command.action === "error") {
				ctx.ui.notify(command.message, "warning");
				return;
			}

			const focusCommandSlot = (): boolean => {
				if (command.action === "show" || command.action === "ask" || command.action === "select") {
					return true;
				}
				if (command.slot === undefined) return true;
				const focused = focusExistingSlot(command.slot - 1);
				if (!focused) {
					ctx.ui.notify(`BTW slot ${command.slot} is empty.`, "warning");
					return false;
				}
				return true;
			};

			if (command.action === "inject") {
				if (!focusCommandSlot()) return;
				return injectSlot(ctx);
			}
			if (command.action === "clear") {
				if (!focusCommandSlot()) return;
				return clearSlot(ctx);
			}
			if (command.action === "fork") {
				if (!focusCommandSlot()) return;
				try {
					await promoteSlot(ctx);
				} catch (error) {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
				return;
			}

			try {
				if (command.action === "select") {
					// Selecting a bare number focuses if present, otherwise opens an empty slot.
					const index = resolveBtwSlotIndex(command.slot, activeIndex);
					if (!focusExistingSlot(index)) ensureSlot(index);
					renderWidget(ctx);
					return;
				}
				if (command.action === "ask") {
					const slot = ensureSlot(resolveBtwSlotIndex(command.slot, activeIndex));
					queueQuestion(ctx, slot, command.question);
					return;
				}
				ensureSlot();
				renderWidget(ctx);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
			}
		},
	});

	pi.registerShortcut("alt+z", {
		description: "Route the current editor draft to /btw",
		handler: (ctx) => {
			const draft = ctx.ui.getEditorText();
			if (draft.trimStart().startsWith("/btw")) return;
			ctx.ui.setEditorText(draft.trim() ? `/btw ${draft}` : "/btw ");
		},
	});
	pi.registerShortcut("alt+o", {
		description: "Expand or collapse the active BTW answer",
		handler: toggleAnswerExpanded,
	});
	pi.registerShortcut("alt+c", { description: "Inject and clear active BTW slot", handler: injectSlot });
	pi.registerShortcut("alt+x", { description: "Discard active BTW slot", handler: clearSlot });
	pi.registerShortcut("alt+shift+f", {
		description: "Promote active BTW slot into a forked Pi session",
		handler: async (ctx) => {
			try {
				await promoteSlot(ctx);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
	const selectRelativeSlot = (ctx: ExtensionContext, delta: -1 | 1): void => {
		const existing = listSlots();
		if (existing.length === 0) return;
		const position = Math.max(0, existing.findIndex((slot) => slot.index === activeIndex));
		const next = existing[(position + delta + existing.length) % existing.length]!;
		focusExistingSlot(next.index);
		renderWidget(ctx);
	};
	// Vim-style: j/down = next slot; k/up = previous slot.
	pi.registerShortcut("alt+shift+j", {
		description: "Select next BTW slot",
		handler: (ctx) => selectRelativeSlot(ctx, 1),
	});
	pi.registerShortcut("alt+shift+down", {
		description: "Select next BTW slot",
		handler: (ctx) => selectRelativeSlot(ctx, 1),
	});
	pi.registerShortcut("alt+shift+k", {
		description: "Select previous BTW slot",
		handler: (ctx) => selectRelativeSlot(ctx, -1),
	});
	pi.registerShortcut("alt+shift+up", {
		description: "Select previous BTW slot",
		handler: (ctx) => selectRelativeSlot(ctx, -1),
	});
}
