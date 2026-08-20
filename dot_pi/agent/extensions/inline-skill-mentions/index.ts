/**
 * Recognize `@skill-name` in user input and invoke it as `/skill:name`.
 * Mid-prompt `@` lists skill names above file and agent rows.
 *
 * One mention becomes `/skill:name leftover`. Extra mentions stay queued
 * and are injected on before_agent_start as a skill-context custom message.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const AT_SKILL = /(^|[ \t\n])@([a-z0-9]+(?:-[a-z0-9]+)*)(?=$|[^a-z0-9-])/g;
const AT_QUERY = /(?:^|[\s。、？！])@([A-Za-z0-9-]*)$/;
const SKILL_CONTEXT_TYPE = "skill-context";
const SKILL_CONTEXT_PREVIEW_LINES = 8;

export type InlineSkill = {
	name: string;
	filePath: string;
	baseDir: string;
	description?: string;
	body: string;
};

export type CollectedInlineSkillMentions = {
	skills: InlineSkill[];
	stripped: string;
};

export type InlineSkillMentionPlan =
	| { action: "continue" }
	| { action: "transform"; text: string; extraSkills: InlineSkill[] };

/** Slash-command metadata used to list `@skill` autocomplete rows. */
export type InlineSkillAutocompleteCommand = {
	name: string;
	source: string;
	description?: string;
};

export type InlineSkillAutocompleteItem = {
	value: string;
	label: string;
	description?: string;
};

export type InlineSkillAutocompleteSuggestions = {
	items: InlineSkillAutocompleteItem[];
	prefix: string;
};

/** `@` token being typed at the cursor, if any. Mid-prompt `hello there @` counts. */
export function inlineSkillMentionQuery(beforeCursor: string): { prefix: string; query: string } | undefined {
	const match = beforeCursor.match(AT_QUERY);
	if (!match) return undefined;
	return { prefix: `@${match[1]}`, query: match[1] ?? "" };
}

/**
 * Build `@skill-name` autocomplete rows from command metadata.
 * Does not read SKILL.md. File paths stay out of this list.
 */
export function listInlineSkillAutocompleteItems(
	query: string,
	commands: readonly InlineSkillAutocompleteCommand[],
): InlineSkillAutocompleteItem[] {
	const needle = query.toLowerCase();
	const items: InlineSkillAutocompleteItem[] = [];
	const seen = new Set<string>();
	for (const command of commands) {
		if (command.source !== "skill") continue;
		const name = command.name.startsWith("skill:") ? command.name.slice(6) : command.name;
		if (seen.has(name) || !name.toLowerCase().includes(needle)) continue;
		seen.add(name);
		items.push({
			value: `@${name}`,
			label: `@${name}`,
			...(command.description ? { description: command.description } : {}),
		});
	}
	return items;
}

/** Put matching skill names above file and agent rows for the same `@` token. */
export function mergeInlineSkillAutocompleteSuggestions(
	prefix: string,
	skillItems: readonly InlineSkillAutocompleteItem[],
	current: InlineSkillAutocompleteSuggestions | null,
): InlineSkillAutocompleteSuggestions | null {
	if (skillItems.length === 0) return current;
	if (!current?.items.length) return { prefix, items: [...skillItems] };
	return { prefix, items: [...skillItems, ...current.items] };
}

/**
 * Collect known `@skill` mentions and strip them from the user prompt.
 * Unknown names, emails, and `/skill:name` stay literal. Does not inline skill bodies.
 */
export function collectInlineSkillMentions(
	text: string,
	skills: ReadonlyMap<string, InlineSkill>,
): CollectedInlineSkillMentions {
	const seen = new Set<string>();
	const collected: InlineSkill[] = [];
	const stripped = text.replace(AT_SKILL, (full, lead: string, name: string) => {
		const skill = skills.get(name);
		if (!skill) return full;
		if (!seen.has(skill.name)) {
			seen.add(skill.name);
			collected.push(skill);
		}
		return lead;
	});
	return {
		skills: collected,
		stripped: collapseInlineSkillMentionGaps(stripped),
	};
}

/**
 * Rewrite known `@skill` mentions to `/skill:name leftover`.
 * That uses Pi's skill-command expansion so mention-only input still starts a turn.
 */
export function planInlineSkillMentionInput(
	text: string,
	skills: ReadonlyMap<string, InlineSkill>,
): InlineSkillMentionPlan {
	const collected = collectInlineSkillMentions(text, skills);
	const first = collected.skills[0];
	if (!first) return { action: "continue" };
	const command = `/skill:${first.name}`;
	return {
		action: "transform",
		text: collected.stripped ? `${command} ${collected.stripped}` : command,
		extraSkills: collected.skills.slice(1),
	};
}

/** Build the skill-context payload. Relative references resolve against the skill directory. */
export function buildInlineSkillContext(skills: readonly InlineSkill[]): string {
	const blocks = skills.map((skill) => {
		const name = escapeInlineSkillAttribute(skill.name);
		const location = escapeInlineSkillAttribute(skill.filePath);
		return `<skill name="${name}" location="${location}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
	});
	if (blocks.length === 1) return blocks[0] ?? "";
	return `<skills count="${blocks.length}">\n${blocks.join("\n\n")}\n</skills>`;
}

/** Keep unique queued skills in first-mention order. */
export function queueUniqueInlineSkills(queue: readonly InlineSkill[], incoming: readonly InlineSkill[]): InlineSkill[] {
	const names = new Set(queue.map((skill) => skill.name));
	const next = [...queue];
	for (const skill of incoming) {
		if (names.has(skill.name)) continue;
		next.push(skill);
		names.add(skill.name);
	}
	return next;
}

function collapseInlineSkillMentionGaps(text: string): string {
	return text
		.replace(/[ \t]{2,}/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function escapeInlineSkillAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith("---")) return content;
	const end = content.indexOf("\n---", 3);
	if (end === -1) return content;
	return content.slice(end + 4).replace(/^\r?\n/, "");
}

function loadInlineSkills(pi: ExtensionAPI): Map<string, InlineSkill> {
	const skills = new Map<string, InlineSkill>();
	for (const command of pi.getCommands()) {
		if (command.source !== "skill") continue;
		const name = command.name.startsWith("skill:") ? command.name.slice(6) : command.name;
		const filePath = command.sourceInfo.path;
		try {
			skills.set(name, {
				name,
				filePath,
				baseDir: dirname(filePath),
				description: command.description,
				body: stripFrontmatter(readFileSync(filePath, "utf-8")).trim(),
			});
		} catch {
			continue;
		}
	}
	return skills;
}

function extractSkillContextText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part !== "object" || part === null || !("type" in part)) return "";
			const textPart = part as { type?: unknown; text?: unknown };
			if (textPart.type !== "text" || typeof textPart.text !== "string") return "";
			return textPart.text;
		})
		.join("");
}

export default function (pi: ExtensionAPI) {
	let queuedSkills: InlineSkill[] = [];

	pi.registerMessageRenderer(SKILL_CONTEXT_TYPE, (message, options, theme) => {
		const rawContent = extractSkillContextText(message.content);
		const skillMatches = Array.from(rawContent.matchAll(/<skill name="([^"]+)"[^>]*>\n?([\s\S]*?)\n?<\/skill>/g));
		const skillNames = skillMatches.map((match) => match[1]);
		const skillTitle = skillNames.length > 1 ? skillNames.join(", ") : (skillNames[0] ?? "Unknown Skill");
		const skillContent =
			skillMatches.length > 1
				? skillMatches.map((match) => `# ${match[1]}\n${match[2]?.trim() ?? ""}`).join("\n\n")
				: (skillMatches[0]?.[2]?.trim() || rawContent);
		const lines = skillContent.split("\n");
		const shownLines = options.expanded ? lines : lines.slice(0, SKILL_CONTEXT_PREVIEW_LINES);
		const parts = [
			theme.fg("accent", "◆ ") +
				theme.fg("customMessageLabel", theme.bold(skillNames.length > 1 ? "Skills: " : "Skill: ")) +
				theme.fg("accent", skillTitle),
			shownLines.map((line) => theme.fg("dim", line)).join("\n"),
		];
		if (!options.expanded && lines.length > SKILL_CONTEXT_PREVIEW_LINES) {
			parts.push(theme.fg("muted", `... ${lines.length - SKILL_CONTEXT_PREVIEW_LINES} more lines (click to expand)`));
		}
		return new Text(parts.join("\n"), options.outputPad, 0);
	});

	// After session_start: pi-fff answers `@` with files and does not call
	// inner providers. Registering here keeps skill names on the outside.
	pi.on("resources_discover", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["@"],
			async getSuggestions(lines, line, col, options) {
				const at = inlineSkillMentionQuery((lines[line] ?? "").slice(0, col));
				let currentSuggestions: InlineSkillAutocompleteSuggestions | null = null;
				try {
					currentSuggestions = await current.getSuggestions(lines, line, col, options);
				} catch {
					currentSuggestions = null;
				}
				if (!at) return currentSuggestions;
				let skillItems: InlineSkillAutocompleteItem[] = [];
				try {
					skillItems = listInlineSkillAutocompleteItems(at.query, pi.getCommands());
				} catch {
					skillItems = [];
				}
				return mergeInlineSkillAutocompleteSuggestions(at.prefix, skillItems, currentSuggestions);
			},
			applyCompletion(lines, line, col, item, prefix) {
				return current.applyCompletion(lines, line, col, item, prefix);
			},
			shouldTriggerFileCompletion(lines, line, col) {
				return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
			},
		}));
	});

	pi.on("input", async (event) => {
		if (event.source === "extension") return { action: "continue" };
		const plan = planInlineSkillMentionInput(event.text, loadInlineSkills(pi));
		if (plan.action === "continue") return { action: "continue" };
		queuedSkills = queueUniqueInlineSkills(queuedSkills, plan.extraSkills);
		return { action: "transform", text: plan.text };
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (queuedSkills.length === 0) return {};
		const skills = queuedSkills;
		queuedSkills = [];
		try {
			return {
				message: {
					customType: SKILL_CONTEXT_TYPE,
					content: buildInlineSkillContext(skills),
					display: true,
				},
			};
		} catch {
			if (ctx.hasUI) {
				ctx.ui.notify(`Failed to load selected skills: ${skills.map((skill) => skill.name).join(", ")}`, "warning");
			}
			return {};
		}
	});
}
