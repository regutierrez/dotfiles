/**
 * Pi session naming for `/pi-rename`: parse command args, normalize the
 * session name, and pick the prompt text and model for auto-summarized names.
 * Pure helpers; the Herdr Agents-panel mirror lives in herdr-agent-metadata.ts.
 */

export const PI_SESSION_NAME_MAX_CHARS = 64;
export const PI_RENAME_PROMPT_MAX_CHARS = 1200;
export const PI_RENAME_MODEL_REF = "openai-codex/gpt-5.6-luna";
export const PI_RENAME_DEFAULT_THINKING = "low" as const;

export const PI_RENAME_SYSTEM_PROMPT = `Name this coding agent session.
Return one short session name, at most 64 characters, that says what the user asked.
Use the latest user prompt. Ignore system and assistant text.
Plain text only. No quotes, no punctuation, no prefix, no markdown.`;

export type PiRenameCommand =
	| { action: "summarize" }
	| { action: "set"; comment: string }
	| { action: "clear" }
	| { action: "error"; message: string };

/** Parse `/pi-rename` args. Bare `--clear` clears the session name. */
export function parsePiRenameCommand(args: string): PiRenameCommand {
	const trimmed = args.trim();
	if (!trimmed) return { action: "summarize" };
	if (trimmed === "--clear") return { action: "clear" };
	if (trimmed.startsWith("-") && !trimmed.startsWith("--")) {
		return { action: "error", message: "pi-rename: unknown flag; use --clear or a session name" };
	}
	if (trimmed.startsWith("--") && trimmed !== "--clear") {
		return { action: "error", message: "pi-rename: unknown flag; use --clear or a session name" };
	}
	return { action: "set", comment: trimmed };
}

/**
 * Normalize a Pi session name to the 64-character naming cap.
 * Empty after normalize means "no name".
 */
export function normalizePiSessionName(raw: string): string | undefined {
	const firstLine = raw.split(/\r?\n/u, 1)[0] ?? "";
	const stripped = firstLine
		.replace(/[\u0000-\u001f\u007f]/gu, "")
		.replace(/^[`'"]+/u, "")
		.replace(/[`'"]+$/u, "")
		.replace(/\s+/gu, " ")
		.trim();
	if (!stripped) return undefined;
	return stripped.length > PI_SESSION_NAME_MAX_CHARS
		? stripped.slice(0, PI_SESSION_NAME_MAX_CHARS).trimEnd()
		: stripped;
}

type SessionTextPart = {
	type?: string;
	text?: string;
};

type SessionMessage = {
	role?: string;
	content?: string | SessionTextPart[];
};

export type PiRenameSessionEntry = {
	type?: string;
	message?: SessionMessage;
};

/** Latest user prompt text from session entries. Walks newest to oldest. */
export function extractLatestUserPromptText(entries: readonly PiRenameSessionEntry[]): string | undefined {
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
export function clipPiRenamePrompt(prompt: string): string {
	const collapsed = prompt.replace(/\s+/gu, " ").trim();
	if (collapsed.length <= PI_RENAME_PROMPT_MAX_CHARS) return collapsed;
	return `${collapsed.slice(0, PI_RENAME_PROMPT_MAX_CHARS).trimEnd()}…`;
}

export type PiRenameModelPick<TModel> =
	| { model: TModel; thinkingLevel: typeof PI_RENAME_DEFAULT_THINKING }
	| { error: string };

/** Prefer `openai-codex/gpt-5.6-luna`; accept any authorized `gpt-5.6-luna`. */
export function selectPiRenameModel<TModel extends { provider: string; id: string }>(
	registry: {
		find: (provider: string, modelId: string) => TModel | undefined;
		hasConfiguredAuth: (model: TModel) => boolean;
		getAvailable?: () => TModel[];
	},
	preferredRef = PI_RENAME_MODEL_REF,
): PiRenameModelPick<TModel> {
	const preferred = parseProviderModelRef(preferredRef);
	if (preferred) {
		const model = registry.find(preferred.provider, preferred.modelId);
		if (model && registry.hasConfiguredAuth(model)) {
			return { model, thinkingLevel: PI_RENAME_DEFAULT_THINKING };
		}
	}

	const available = registry.getAvailable?.() ?? [];
	const luna = available.find((model) => model.id === "gpt-5.6-luna" && registry.hasConfiguredAuth(model));
	if (luna) return { model: luna, thinkingLevel: PI_RENAME_DEFAULT_THINKING };

	return { error: `pi-rename: ${preferredRef} is unavailable` };
}

export function parseProviderModelRef(ref: string): { provider: string; modelId: string } | undefined {
	const separator = ref.indexOf("/");
	if (separator <= 0 || separator === ref.length - 1) return undefined;
	return { provider: ref.slice(0, separator), modelId: ref.slice(separator + 1) };
}

/** Fallback session name when Luna is missing or returns empty text: clipped latest user prompt. */
export function fallbackPiSessionName(prompt: string): string | undefined {
	return normalizePiSessionName(prompt);
}
