/**
 * Expand `@skill-name` in user input to the skill body.
 * `@` also completes skill names.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AT_SKILL = /(^|[ \t\n])@([a-z0-9]+(?:-[a-z0-9]+)*)(?=$|[^a-z0-9-])/g;
const AT_QUERY = /(?:^|[ \t])@([a-z0-9-]*)$/;

export type InlineSkill = {
	name: string;
	filePath: string;
	baseDir: string;
	description?: string;
	body: string;
};

/** Replace known `@name` tokens with Pi skill blocks. Unknown names stay literal. */
export function expandInlineSkillMentions(text: string, skills: ReadonlyMap<string, InlineSkill>): string {
	return text.replace(AT_SKILL, (full, lead: string, name: string) => {
		const skill = skills.get(name);
		if (!skill) return full;
		return `${lead}<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
	});
}

/** `@` token being typed at the cursor, if any. */
export function inlineSkillMentionQuery(beforeCursor: string): { prefix: string; query: string } | undefined {
	const match = beforeCursor.match(AT_QUERY);
	if (!match) return undefined;
	return { prefix: `@${match[1]}`, query: match[1] ?? "" };
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
				baseDir: command.sourceInfo.baseDir ?? dirname(filePath),
				description: command.description,
				body: stripFrontmatter(readFileSync(filePath, "utf-8")).trim(),
			});
		} catch {
			continue;
		}
	}
	return skills;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["@"],
			async getSuggestions(lines, line, col, options) {
				const at = inlineSkillMentionQuery((lines[line] ?? "").slice(0, col));
				if (!at) return current.getSuggestions(lines, line, col, options);
				const items = [...loadInlineSkills(pi).values()]
					.filter((skill) => skill.name.includes(at.query))
					.map((skill) => ({
						value: `@${skill.name}`,
						label: `@${skill.name}`,
						description: skill.description,
					}));
				return { prefix: at.prefix, items };
			},
			applyCompletion(lines, line, col, item, prefix) {
				return current.applyCompletion(lines, line, col, item, prefix);
			},
			shouldTriggerFileCompletion(lines, line, col) {
				if (inlineSkillMentionQuery((lines[line] ?? "").slice(0, col))) return false;
				return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
			},
		}));
	});

	pi.on("input", async (event) => {
		if (event.source === "extension") return { action: "continue" };
		const text = expandInlineSkillMentions(event.text, loadInlineSkills(pi));
		return text === event.text ? { action: "continue" } : { action: "transform", text };
	});
}
