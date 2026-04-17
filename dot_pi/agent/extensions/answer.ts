import { complete, type Model, type Api, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

interface ExtractedQuestion {
	question: string;
	context?: string;
}

interface ExtractionResult {
	questions: ExtractedQuestion[];
}

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output a JSON object with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "context": "Optional context that helps answer the question"
    }
  ]
}

Rules:
- Extract all questions that require user input
- Keep questions in the order they appeared
- Be concise with question text
- Include context only when it provides essential information for answering
- If no questions are found, return {"questions": []}
- IMPORTANT: When a question has multiple choice options (a, b, c or 1, 2, 3), preserve them EXACTLY in the context field using the format "(a) Option one, (b) Option two, (c) Option three"

Example output:
{
  "questions": [
    {
      "question": "What is your preferred database?",
      "context": "(a) MySQL, (b) PostgreSQL, (c) SQLite"
    },
    {
      "question": "Should we use TypeScript or JavaScript?",
      "context": "(a) TypeScript, (b) JavaScript"
    },
    {
      "question": "What port should the server run on?"
    }
  ]
}`;

const EXTRACTION_PROVIDER = "google-vertex";
const EXTRACTION_MODEL_ID = "gemini-3-flash-preview";

async function selectExtractionModel(
	currentModel: Model<Api>,
	modelRegistry: {
		find: (provider: string, modelId: string) => Model<Api> | undefined;
		getApiKeyAndHeaders: (model: Model<Api>) => Promise<{ ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string }>;
	},
): Promise<Model<Api>> {
	const preferredModel = modelRegistry.find(EXTRACTION_PROVIDER, EXTRACTION_MODEL_ID);
	if (preferredModel) {
		const auth = await modelRegistry.getApiKeyAndHeaders(preferredModel);
		if (auth.ok) {
			return preferredModel;
		}
	}

	return currentModel;
}

function parseExtractionResult(text: string): ExtractionResult | null {
	try {
		let jsonStr = text;
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1].trim();
		}

		const parsed = JSON.parse(jsonStr);
		if (parsed && Array.isArray(parsed.questions)) {
			return parsed as ExtractionResult;
		}
		return null;
	} catch {
		return null;
	}
}

class QnAComponent implements Component {
	private questions: ExtractedQuestion[];
	private answers: string[];
	private currentIndex = 0;
	private editor: Editor;
	private tui: TUI;
	private onDone: (result: string | null) => void;
	private showingConfirmation = false;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	private bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
	private cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
	private green = (s: string) => `\x1b[32m${s}\x1b[0m`;
	private yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
	private gray = (s: string) => `\x1b[90m${s}\x1b[0m`;

	constructor(questions: ExtractedQuestion[], tui: TUI, onDone: (result: string | null) => void) {
		this.questions = questions;
		this.answers = questions.map(() => "");
		this.tui = tui;
		this.onDone = onDone;

		const editorTheme: EditorTheme = {
			borderColor: this.dim,
			selectList: {
				selectedPrefix: this.cyan,
				selectedText: (s: string) => `\x1b[44m${s}\x1b[0m`,
				description: this.gray,
				scrollInfo: this.gray,
				noMatch: this.dim,
			},
		};

		this.editor = new Editor(tui, editorTheme);
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.invalidate();
			this.tui.requestRender();
		};
	}

	private saveCurrentAnswer(): void {
		this.answers[this.currentIndex] = this.editor.getText();
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) return;
		this.saveCurrentAnswer();
		this.currentIndex = index;
		this.editor.setText(this.answers[index] || "");
		this.invalidate();
	}

	private formatContextForDisplay(context: string, maxWidth: number): string[] {
		const lines: string[] = [];
		const choicePattern = /(?:^|,\s*|\s+)\(([a-z]|[0-9]+)\)\s+/gi;
		const matches = [...context.matchAll(choicePattern)];

		if (matches.length >= 2) {
			const firstMatchIndex = matches[0].index || 0;
			const prefix = context.slice(0, firstMatchIndex).trim();
			if (prefix) {
				const wrappedPrefix = wrapTextWithAnsi(prefix, maxWidth);
				lines.push(...wrappedPrefix);
				lines.push("");
			}

			for (let i = 0; i < matches.length; i++) {
				const startIndex = matches[i].index || 0;
				const endIndex = i < matches.length - 1 ? matches[i + 1].index : context.length;
				const choiceText = context.slice(startIndex, endIndex).replace(/^,?\s*/, "").trim();
				const wrappedChoice = wrapTextWithAnsi(`  ${choiceText}`, maxWidth);
				lines.push(...wrappedChoice);
			}

			return lines;
		}

		return wrapTextWithAnsi(context, maxWidth);
	}

	private formatContext(context: string): string[] {
		const choicePattern = /(?:^|,\s*|\s+)\(([a-z]|[0-9]+)\)\s+/gi;
		const matches = [...context.matchAll(choicePattern)];

		if (matches.length >= 2) {
			const lines: string[] = [];
			const firstMatchIndex = matches[0].index || 0;
			const prefix = context.slice(0, firstMatchIndex).trim();
			if (prefix) {
				lines.push(`> ${prefix}`);
			}

			for (let i = 0; i < matches.length; i++) {
				const startIndex = matches[i].index || 0;
				const endIndex = i < matches.length - 1 ? matches[i + 1].index : context.length;
				const choiceText = context.slice(startIndex, endIndex).replace(/^,?\s*/, "").trim();
				lines.push(`>   ${choiceText}`);
			}

			return lines;
		}

		return [`> ${context}`];
	}

	private submit(): void {
		this.saveCurrentAnswer();
		const parts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const q = this.questions[i];
			const a = this.answers[i]?.trim() || "(no answer)";
			parts.push(`Q: ${q.question}`);
			if (q.context) {
				parts.push(...this.formatContext(q.context));
			}
			parts.push(`A: ${a}`);
			parts.push("");
		}
		this.onDone(parts.join("\n").trim());
	}

	private cancel(): void {
		this.onDone(null);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		if (matchesKey(data, Key.tab)) {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, Key.up) && this.editor.getText() === "") {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
				return;
			}
		}
		if (matchesKey(data, Key.down) && this.editor.getText() === "") {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
				return;
			}
		}

		if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
			this.saveCurrentAnswer();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				this.showingConfirmation = true;
			}
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		this.editor.handleInput(data);
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const boxWidth = Math.min(width - 4, 120);
		const contentWidth = boxWidth - 4;
		const horizontalLine = (count: number) => "─".repeat(count);

		const boxLine = (content: string, leftPad = 2): string => {
			const paddedContent = " ".repeat(leftPad) + content;
			const contentLen = visibleWidth(paddedContent);
			const rightPad = Math.max(0, boxWidth - contentLen - 2);
			return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
		};

		const emptyBoxLine = (): string => this.dim("│") + " ".repeat(boxWidth - 2) + this.dim("│");
		const padToWidth = (line: string): string => line + " ".repeat(Math.max(0, width - visibleWidth(line)));

		lines.push(padToWidth(this.dim("╭" + horizontalLine(boxWidth - 2) + "╮")));
		const title = `${this.bold(this.cyan("Questions"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
		lines.push(padToWidth(boxLine(title)));
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

		const progressParts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const answered = (this.answers[i]?.trim() || "").length > 0;
			const current = i === this.currentIndex;
			if (current) progressParts.push(this.cyan("●"));
			else if (answered) progressParts.push(this.green("●"));
			else progressParts.push(this.dim("○"));
		}
		lines.push(padToWidth(boxLine(progressParts.join(" "))));
		lines.push(padToWidth(emptyBoxLine()));

		const q = this.questions[this.currentIndex];
		const wrappedQuestion = wrapTextWithAnsi(`${this.bold("Q:")} ${q.question}`, contentWidth);
		for (const line of wrappedQuestion) {
			lines.push(padToWidth(boxLine(line)));
		}

		if (q.context) {
			lines.push(padToWidth(emptyBoxLine()));
			const contextLines = this.formatContextForDisplay(q.context, contentWidth - 4);
			for (const contextLine of contextLines) {
				lines.push(padToWidth(boxLine(this.gray(contextLine))));
			}
		}

		lines.push(padToWidth(emptyBoxLine()));

		const answerPrefix = this.bold("A: ");
		const editorWidth = contentWidth - 7;
		const editorLines = this.editor.render(editorWidth);
		for (let i = 1; i < editorLines.length - 1; i++) {
			if (i === 1) lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
			else lines.push(padToWidth(boxLine("   " + editorLines[i])));
		}

		lines.push(padToWidth(emptyBoxLine()));
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));
		if (this.showingConfirmation) {
			const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to cancel)")}`;
			lines.push(padToWidth(boxLine(truncateToWidth(confirmMsg, contentWidth))));
		} else {
			const controls = `${this.dim("Tab/Enter")} next · ${this.dim("Shift+Tab")} prev · ${this.dim("Shift+Enter")} newline · ${this.dim("Esc")} cancel`;
			lines.push(padToWidth(boxLine(truncateToWidth(controls, contentWidth))));
		}
		lines.push(padToWidth(this.dim("╰" + horizontalLine(boxWidth - 2) + "╯")));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	const answerHandler = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) {
			ctx.ui.notify("answer requires interactive mode", "error");
			return;
		}

		if (!ctx.model) {
			ctx.ui.notify("No model selected", "error");
			return;
		}

		const branch = ctx.sessionManager.getBranch();
		let lastAssistantText: string | undefined;

		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!("role" in msg) || msg.role !== "assistant") continue;
			if (msg.stopReason !== "stop" && msg.stopReason !== "toolUse") {
				ctx.ui.notify(`Last assistant message incomplete (${msg.stopReason})`, "error");
				return;
			}
			const textParts = msg.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text);
			if (textParts.length > 0) {
				lastAssistantText = textParts.join("\n");
				break;
			}
		}

		if (!lastAssistantText) {
			ctx.ui.notify("No assistant messages found", "error");
			return;
		}

		const extractionModel = await selectExtractionModel(ctx.model, ctx.modelRegistry);
		let extractionResult: ExtractionResult | null;
		try {
			extractionResult = await ctx.ui.custom<ExtractionResult | null>((tui, theme, _kb, done) => {
				const loader = new BorderedLoader(tui, theme, `Extracting questions using ${extractionModel.id}...`);
				let finished = false;
				const finish = (result: ExtractionResult | null) => {
					if (finished) return;
					finished = true;
					done(result);
				};
				loader.onAbort = () => finish(null);

				const doExtract = async () => {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(extractionModel);
					const apiKey = auth.ok ? auth.apiKey : undefined;
					const headers = auth.ok ? auth.headers : undefined;
					const userMessage: UserMessage = {
						role: "user",
						content: [{ type: "text", text: lastAssistantText! }],
						timestamp: Date.now(),
					};

					const response = await complete(
						extractionModel,
						{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
						{ apiKey, headers, signal: loader.signal },
					);

					if (response.stopReason === "aborted") {
						finish(null);
						return;
					}

					const responseText = response.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");

					const parsed = parseExtractionResult(responseText);
					if (!parsed) {
						ctx.ui.notify("Question extraction returned invalid JSON", "error");
					}
					finish(parsed);
				};

				void doExtract().catch((error) => {
					ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
					finish(null);
				});
				return loader;
			});
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			return;
		}

		if (extractionResult === null) {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		if (extractionResult.questions.length === 0) {
			ctx.ui.notify("No questions found in the last message", "info");
			return;
		}

		const answersResult = await ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
			return new QnAComponent(extractionResult.questions, tui, done as (data: string | null) => void);
		});

		if (answersResult === null) {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		pi.sendMessage(
			{
				customType: "answers",
				content: "I answered your questions in the following way:\n\n" + answersResult,
				display: true,
			},
			{ triggerTurn: true },
		);
	};

	pi.registerCommand("answer", {
		description: "Extract questions from last assistant message into interactive Q&A",
		handler: (_args, ctx) => answerHandler(ctx),
	});

	pi.registerShortcut("ctrl+.", {
		description: "Extract and answer questions",
		handler: answerHandler,
	});

	pi.events.on("trigger:answer", (data: unknown) => {
		void answerHandler(data as ExtensionContext);
	});
}
