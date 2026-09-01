/**
 * Keep pi-subagents tool schemas inactive until the user asks for subagents.
 * The package still loads (`/agents`, widget, fleet view). Only LLM context
 * is deferred: Agent, SubagentWorkflow, get_subagent_result, steer_subagent.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Tool names registered by `@tintinweb/pi-subagents` that carry the large schemas. */
export const SUBAGENT_LAZY_TOOL_NAMES = [
	"Agent",
	"SubagentWorkflow",
	"get_subagent_result",
	"steer_subagent",
] as const;

const SUBAGENT_LAZY_TOOL_NAME_SET = new Set<string>(SUBAGENT_LAZY_TOOL_NAMES);
const SUBAGENTS_ENABLE_COMMAND = "/subagents";
const EXPANDED_SKILL_PROMPT_PREFIX = "<skill ";

const SUBAGENT_WORD = /\bsub-?agents?\b/i;
const SUBAGENT_WORKFLOW_TOOL = /\bSubagentWorkflow\b/;
const SUBAGENT_WORKFLOW_PHRASE =
	/\b(?:use|run|start)\s+(?:a\s+|the\s+)?(?:subagent\s+|scripted\s+|multi-agent\s+)?workflow\b/i;
const SUBAGENT_FAN_OUT = /\bfan[ -]out\b/i;
const SUBAGENT_SPAWN =
	/\b(?:spawn|launch|start|delegate(?:\s+to)?|ask|call|use)\b[\s\S]{0,60}\b(?:the\s+)?(?:explore|oracle|librarian|reviewer|impl|general-purpose)(?:\s+agent|\s+sub-?agent)?\b/i;
const SUBAGENT_SPAWN_AGENT = /\b(?:spawn|launch)\s+(?:an?\s+|the\s+)?(?:sub-?agent|agent)\b/i;
const PI_SUBAGENTS_PACKAGE = /\bpi-subagents\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** True when the user (or a loaded skill) explicitly asked to spawn or orchestrate subagents. */
export function userAskedForSubagents(text: string): boolean {
	const command = text.trimStart();
	if (command === SUBAGENTS_ENABLE_COMMAND || command.startsWith(`${SUBAGENTS_ENABLE_COMMAND} `)) {
		return true;
	}
	return (
		SUBAGENT_WORD.test(text) ||
		SUBAGENT_WORKFLOW_TOOL.test(text) ||
		SUBAGENT_WORKFLOW_PHRASE.test(text) ||
		SUBAGENT_FAN_OUT.test(text) ||
		SUBAGENT_SPAWN.test(text) ||
		SUBAGENT_SPAWN_AGENT.test(text) ||
		PI_SUBAGENTS_PACKAGE.test(text)
	);
}

/** True when an expanded `/skill:...` body asks for pi-subagents. */
export function expandedSkillAskedForSubagents(text: string): boolean {
	if (!text.trimStart().startsWith(EXPANDED_SKILL_PROMPT_PREFIX)) return false;
	return userAskedForSubagents(text);
}

function isSubagentLazyToolName(name: string): boolean {
	return SUBAGENT_LAZY_TOOL_NAME_SET.has(name);
}

/** True when this session already called a pi-subagents tool. */
export function sessionBranchUsedSubagentTools(branch: readonly unknown[]): boolean {
	for (const entry of branch) {
		if (!isRecord(entry) || entry.type !== "message") continue;
		const message = entry.message;
		if (!isRecord(message)) continue;
		if (typeof message.toolName === "string" && isSubagentLazyToolName(message.toolName)) {
			return true;
		}
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (!isRecord(part)) continue;
			if (part.type === "text" && typeof part.text === "string" && expandedSkillAskedForSubagents(part.text)) {
				return true;
			}
			if (part.type === "toolCall" && typeof part.name === "string" && isSubagentLazyToolName(part.name)) {
				return true;
			}
		}
	}
	return false;
}

function registeredSubagentLazyToolNames(pi: ExtensionAPI): string[] {
	const registered = new Set(pi.getAllTools().map((tool) => tool.name));
	return SUBAGENT_LAZY_TOOL_NAMES.filter((name) => registered.has(name));
}

/** Hide every pi-subagents tool schema from the first-turn active set. */
function deactivateSubagentLazyTools(pi: ExtensionAPI): void {
	const subagentTools = new Set(registeredSubagentLazyToolNames(pi));
	if (subagentTools.size === 0) return;
	const active = pi.getActiveTools();
	const next = active.filter((name) => !subagentTools.has(name));
	if (next.length !== active.length) {
		pi.setActiveTools(next);
	}
}

/** Add registered pi-subagents tools without removing other active tools. */
function activateSubagentLazyTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const missing = registeredSubagentLazyToolNames(pi).filter((name) => !active.includes(name));
	if (missing.length === 0) return;
	pi.setActiveTools([...active, ...missing]);
}

/** Defer every pi-subagents tool schema until the user asks for subagents. */
export default function subagentsLazyTools(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		if (sessionBranchUsedSubagentTools(ctx.sessionManager.getBranch())) {
			activateSubagentLazyTools(pi);
			return;
		}
		deactivateSubagentLazyTools(pi);
	});

	pi.on("input", (event) => {
		if (userAskedForSubagents(event.text)) {
			activateSubagentLazyTools(pi);
		}
		return { action: "continue" };
	});

	pi.on("before_agent_start", (event) => {
		if (!expandedSkillAskedForSubagents(event.prompt) && !userAskedForSubagents(event.prompt)) return;
		activateSubagentLazyTools(pi);
	});

	pi.registerCommand("subagents", {
		description: "Enable Agent and SubagentWorkflow tools for this session",
		handler: async (_args, ctx) => {
			activateSubagentLazyTools(pi);
			if (ctx.hasUI) ctx.ui.notify("Subagent tools enabled for this session", "info");
		},
	});
}
