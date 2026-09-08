/**
 * Keep only the pi-subagents workflow schema deferred until subagents are mentioned.
 * Agent, get_subagent_result, and steer_subagent remain available by default.
 * Schema activation is not permission to run a workflow or delegate through Herdr.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Only the workflow schema is lazy; ordinary Pi subagents need no user opt-in. */
export const SUBAGENT_LAZY_TOOL_NAMES = ["SubagentWorkflow"] as const;

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

/** Detect subagent mentions for schema loading, not delegation permission. */
export function mentionsSubagentTools(text: string): boolean {
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

/** Detect subagent mentions in an expanded skill without granting workflow permission. */
export function expandedSkillMentionsSubagents(text: string): boolean {
	if (!text.trimStart().startsWith(EXPANDED_SKILL_PROMPT_PREFIX)) return false;
	return mentionsSubagentTools(text);
}

function isSubagentLazyToolName(name: string): boolean {
	return SUBAGENT_LAZY_TOOL_NAME_SET.has(name);
}

/** Restore workflow schema availability from prior workflow calls or expanded skills. */
export function sessionBranchNeedsWorkflowSchema(branch: readonly unknown[]): boolean {
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
			if (part.type === "text" && typeof part.text === "string" && expandedSkillMentionsSubagents(part.text)) {
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

/** Hide the workflow schema without changing ordinary Pi subagent availability. */
function deactivateSubagentLazyTools(pi: ExtensionAPI): void {
	const subagentTools = new Set(registeredSubagentLazyToolNames(pi));
	if (subagentTools.size === 0) return;
	const active = pi.getActiveTools();
	const next = active.filter((name) => !subagentTools.has(name));
	if (next.length !== active.length) {
		pi.setActiveTools(next);
	}
}

/** Add the registered workflow schema without removing other active tools. */
function activateSubagentLazyTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const missing = registeredSubagentLazyToolNames(pi).filter((name) => !active.includes(name));
	if (missing.length === 0) return;
	pi.setActiveTools([...active, ...missing]);
}

/** Defer the workflow schema only; this is not a delegation permission gate. */
export default function subagentsLazyTools(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		if (sessionBranchNeedsWorkflowSchema(ctx.sessionManager.getBranch())) {
			activateSubagentLazyTools(pi);
			return;
		}
		deactivateSubagentLazyTools(pi);
	});

	pi.on("input", (event) => {
		if (mentionsSubagentTools(event.text)) {
			activateSubagentLazyTools(pi);
		}
		return { action: "continue" };
	});

	pi.on("before_agent_start", (event) => {
		if (!expandedSkillMentionsSubagents(event.prompt) && !mentionsSubagentTools(event.prompt)) return;
		activateSubagentLazyTools(pi);
	});

	pi.registerCommand("subagents", {
		description: "Enable the SubagentWorkflow tool for this session; Agent is already available",
		handler: async (_args, ctx) => {
			activateSubagentLazyTools(pi);
			if (ctx.hasUI) ctx.ui.notify("SubagentWorkflow tool enabled for this session", "info");
		},
	});
}
