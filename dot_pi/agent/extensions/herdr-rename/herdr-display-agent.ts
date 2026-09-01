/**
 * Build the Herdr Agents-panel display-agent label for a Pi pane.
 * Always prefixes the comment with `pi - `. Does not rename the Pi session file.
 */

export const HERDR_RENAME_SOURCE = "user:herdr-rename";
export const HERDR_RENAME_APPLIES_TO_SOURCE = "herdr:pi";
export const HERDR_RENAME_AGENT_GUARD = "pi";
export const HERDR_RENAME_DISPLAY_PREFIX = `${HERDR_RENAME_AGENT_GUARD} - `;
export const HERDR_RENAME_DEFAULT_MODEL_REF = "openai-codex/gpt-5.6-luna";
export const HERDR_RENAME_DEFAULT_THINKING = "low" as const;
/** Max characters the extension will store for a display-agent comment. */
export const HERDR_DISPLAY_AGENT_MAX_CHARS = 64;
/** First Agents-panel name row. Fits a 32-column sidebar after the 3-space indent. */
export const HERDR_NAME_ROW_MAX_CHARS = 29;
export const HERDR_RENAME_NAME1_TOKEN = "name1";
export const HERDR_RENAME_NAME2_TOKEN = "name2";
export const HERDR_RENAME_PROMPT_MAX_CHARS = 1200;

export const HERDR_RENAME_SYSTEM_PROMPT = `Name this Herdr agent for the Agents panel.
Return one short comment, at most 64 characters, that says what the user asked.
Use the latest user prompt. Ignore system and assistant text.
Plain text only. No quotes, no punctuation, no prefix, no markdown.`;

export type HerdrRenameCommand =
	| { action: "summarize" }
	| { action: "set"; comment: string }
	| { action: "clear" }
	| { action: "error"; message: string };

export type HerdrRenamePaneEnv =
	| { ok: true; paneId: string; herdrBin: string }
	| { ok: false; reason: string };

export type HerdrRenameModelPick<TModel> =
	| { model: TModel; thinkingLevel: typeof HERDR_RENAME_DEFAULT_THINKING }
	| { error: string };

type SessionTextPart = {
	type?: string;
	text?: string;
};

type SessionMessage = {
	role?: string;
	content?: string | SessionTextPart[];
};

export type HerdrRenameSessionEntry = {
	type?: string;
	message?: SessionMessage;
};

/** True only inside a Herdr-managed pane (`HERDR_ENV=1` plus a pane id). */
export function isHerdrRenameSession(env: NodeJS.ProcessEnv): boolean {
	return resolveHerdrRenamePaneEnv(env).ok;
}

/**
 * Resolve the Herdr pane this Pi process can label.
 * Uses `HERDR_BIN_PATH` when set so the report hits the same binary as the pane.
 */
export function resolveHerdrRenamePaneEnv(env: NodeJS.ProcessEnv): HerdrRenamePaneEnv {
	if (env.HERDR_ENV !== "1") {
		return { ok: false, reason: "herdr-rename: not inside a Herdr session" };
	}
	const paneId = env.HERDR_PANE_ID?.trim();
	if (!paneId) {
		return { ok: false, reason: "herdr-rename: HERDR_PANE_ID is missing" };
	}
	const herdrBin = env.HERDR_BIN_PATH?.trim() || "herdr";
	return { ok: true, paneId, herdrBin };
}

/** Parse `/herdr-rename` args. Bare `--clear` clears the display-agent comment. */
export function parseHerdrRenameCommand(args: string): HerdrRenameCommand {
	const trimmed = args.trim();
	if (!trimmed) return { action: "summarize" };
	if (trimmed === "--clear") return { action: "clear" };
	if (trimmed.startsWith("-") && !trimmed.startsWith("--")) {
		return { action: "error", message: "herdr-rename: unknown flag; use --clear or a comment" };
	}
	if (trimmed.startsWith("--") && trimmed !== "--clear") {
		return { action: "error", message: "herdr-rename: unknown flag; use --clear or a comment" };
	}
	return { action: "set", comment: trimmed };
}

/**
 * Normalize a display-agent comment to the 64-character naming cap.
 * Empty after normalize means "no comment".
 */
export function normalizeHerdrDisplayAgent(raw: string): string | undefined {
	const firstLine = raw.split(/\r?\n/u, 1)[0] ?? "";
	const stripped = firstLine
		.replace(/[\u0000-\u001f\u007f]/gu, "")
		.replace(/^[`'"]+/u, "")
		.replace(/[`'"]+$/u, "")
		.replace(/\s+/gu, " ")
		.trim();
	if (!stripped) return undefined;
	return stripped.length > HERDR_DISPLAY_AGENT_MAX_CHARS
		? stripped.slice(0, HERDR_DISPLAY_AGENT_MAX_CHARS).trimEnd()
		: stripped;
}

/** Latest user prompt text from session entries. Walks newest to oldest. */
export function extractLatestUserPromptText(entries: readonly HerdrRenameSessionEntry[]): string | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "message" || entry.message?.role !== "user") continue;
		const text = extractSessionMessageText(entry.message.content);
		if (text) return text;
	}
	return undefined;
}

export function extractSessionMessageText(content: SessionMessage["content"]): string | undefined {
	if (typeof content === "string") {
		const text = content.trim();
		return text || undefined;
	}
	if (!Array.isArray(content)) return undefined;
	const text = content
		.filter((part): part is SessionTextPart & { text: string } => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n")
		.trim();
	return text || undefined;
}

/** Truncate a user prompt so the rename model sees the ask, not a long paste. */
export function clipHerdrRenamePrompt(prompt: string): string {
	const collapsed = prompt.replace(/\s+/gu, " ").trim();
	if (collapsed.length <= HERDR_RENAME_PROMPT_MAX_CHARS) return collapsed;
	return `${collapsed.slice(0, HERDR_RENAME_PROMPT_MAX_CHARS).trimEnd()}…`;
}

/** Prefer `openai-codex/gpt-5.6-luna`; accept any authorized `gpt-5.6-luna`. */
export function selectHerdrRenameModel<TModel extends { provider: string; id: string }>(
	registry: {
		find: (provider: string, modelId: string) => TModel | undefined;
		hasConfiguredAuth: (model: TModel) => boolean;
		getAvailable?: () => TModel[];
	},
	preferredRef = HERDR_RENAME_DEFAULT_MODEL_REF,
): HerdrRenameModelPick<TModel> {
	const preferred = parseProviderModelRef(preferredRef);
	if (preferred) {
		const model = registry.find(preferred.provider, preferred.modelId);
		if (model && registry.hasConfiguredAuth(model)) {
			return { model, thinkingLevel: HERDR_RENAME_DEFAULT_THINKING };
		}
	}

	const available = registry.getAvailable?.() ?? [];
	const luna = available.find((model) => model.id === "gpt-5.6-luna" && registry.hasConfiguredAuth(model));
	if (luna) return { model: luna, thinkingLevel: HERDR_RENAME_DEFAULT_THINKING };

	return { error: `herdr-rename: ${preferredRef} is unavailable` };
}

export function parseProviderModelRef(ref: string): { provider: string; modelId: string } | undefined {
	const separator = ref.indexOf("/");
	if (separator <= 0 || separator === ref.length - 1) return undefined;
	return { provider: ref.slice(0, separator), modelId: ref.slice(separator + 1) };
}

/** Fallback label when Luna is missing or returns empty text: clipped latest user prompt. */
export function fallbackHerdrDisplayAgent(prompt: string): string | undefined {
	return normalizeHerdrDisplayAgent(prompt);
}

/** Prefix an Agents-panel comment with `pi - `. Keep an existing `pi - ` prefix. */
export function formatHerdrRenameDisplayAgent(comment: string): string {
	if (comment.startsWith(HERDR_RENAME_DISPLAY_PREFIX)) return comment;
	return `${HERDR_RENAME_DISPLAY_PREFIX}${comment}`;
}

export type HerdrDisplayAgentNameRows = {
	name1: string;
	name2?: string;
};

/**
 * Split a 64-character display-agent comment into `$name1` and `$name2`.
 * Prefers a word break at or before the first Agents-panel name row.
 */
export function splitHerdrDisplayAgentRows(comment: string): HerdrDisplayAgentNameRows {
	if (comment.length <= HERDR_NAME_ROW_MAX_CHARS) {
		return { name1: comment };
	}
	const window = comment.slice(0, HERDR_NAME_ROW_MAX_CHARS + 1);
	const lastSpace = window.lastIndexOf(" ");
	const splitAt = lastSpace > 0 ? lastSpace : HERDR_NAME_ROW_MAX_CHARS;
	const name1 = comment.slice(0, splitAt).trimEnd();
	const name2 = comment.slice(splitAt).trimStart();
	return name2 ? { name1, name2 } : { name1 };
}

/**
 * CLI argv for `herdr pane report-metadata`.
 * `--display-agent` is `pi - <comment>`, split across the first name row and `$name2`.
 * `$name2` is the wrap row and stays hidden until the prefixed label overflows.
 */
export function buildHerdrDisplayAgentReportArgs(options: {
	paneId: string;
	action: "set" | "clear";
	displayAgent?: string;
}): string[] {
	const args = [
		"pane",
		"report-metadata",
		options.paneId,
		"--source",
		HERDR_RENAME_SOURCE,
		"--agent",
		HERDR_RENAME_AGENT_GUARD,
		"--applies-to-source",
		HERDR_RENAME_APPLIES_TO_SOURCE,
	];
	if (options.action === "clear") {
		args.push(
			"--clear-display-agent",
			"--clear-token",
			HERDR_RENAME_NAME1_TOKEN,
			"--clear-token",
			HERDR_RENAME_NAME2_TOKEN,
		);
		return args;
	}
	if (!options.displayAgent) {
		throw new Error("herdr-rename: display-agent comment is empty");
	}
	const rows = splitHerdrDisplayAgentRows(formatHerdrRenameDisplayAgent(options.displayAgent));
	args.push(
		"--display-agent",
		rows.name1,
		"--clear-token",
		HERDR_RENAME_NAME1_TOKEN,
	);
	if (rows.name2) {
		args.push("--token", `${HERDR_RENAME_NAME2_TOKEN}=${rows.name2}`);
	} else {
		args.push("--clear-token", HERDR_RENAME_NAME2_TOKEN);
	}
	return args;
}
