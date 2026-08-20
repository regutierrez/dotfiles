/**
 * Keep all sideshow tool schemas inactive until `/skill:sideshow` is used.
 * The `/sideshow` status command stays available because commands are not tools.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SIDESHOW_TOOL_NAMES = [
	"sideshow_get_design_guide",
	"sideshow_publish_surface",
	"sideshow_update_surface",
	"sideshow_wait_for_feedback",
	"sideshow_reply_to_user",
	"sideshow_list_surfaces",
	"sideshow_upload_asset",
] as const;

const SIDESHOW_TOOL_NAME_SET = new Set<string>(SIDESHOW_TOOL_NAMES);
const SIDESHOW_SKILL_COMMAND = "/skill:sideshow";
const SIDESHOW_SKILL_PROMPT_PREFIX = '<skill name="sideshow" ';

function isSideshowToolName(name: string): boolean {
	return SIDESHOW_TOOL_NAME_SET.has(name);
}

function isSideshowSkillCommand(text: string): boolean {
	const command = text.trimStart();
	return command === SIDESHOW_SKILL_COMMAND || command.startsWith(`${SIDESHOW_SKILL_COMMAND} `);
}

function isExpandedSideshowSkillPrompt(text: string): boolean {
	return text.trimStart().startsWith(SIDESHOW_SKILL_PROMPT_PREFIX);
}

function registeredSideshowToolNames(pi: ExtensionAPI): string[] {
	const registered = new Set(pi.getAllTools().map((tool) => tool.name));
	return SIDESHOW_TOOL_NAMES.filter((name) => registered.has(name));
}

/** Hide all sideshow tools from the first-turn active set. */
function deactivateSideshowTools(pi: ExtensionAPI): void {
	const sideshowTools = new Set(registeredSideshowToolNames(pi));
	if (sideshowTools.size === 0) return;
	const active = pi.getActiveTools();
	const next = active.filter((name) => !sideshowTools.has(name));
	if (next.length !== active.length) {
		pi.setActiveTools(next);
	}
}

/** Add all registered sideshow tools without removing other active tools. */
function activateSideshowTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const missing = registeredSideshowToolNames(pi).filter((name) => !active.includes(name));
	if (missing.length === 0) return;
	pi.setActiveTools([...active, ...missing]);
}

function sessionAlreadyUsedSideshow(ctx: ExtensionContext): boolean {
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		if ("toolName" in message && typeof message.toolName === "string" && isSideshowToolName(message.toolName)) {
			return true;
		}
		if (!("content" in message) || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (!part || typeof part !== "object" || !("type" in part)) continue;
			if (part.type === "text" && "text" in part && typeof part.text === "string") {
				if (isExpandedSideshowSkillPrompt(part.text)) return true;
				continue;
			}
			if (
				part.type === "toolCall" &&
				"name" in part &&
				typeof part.name === "string" &&
				isSideshowToolName(part.name)
			) {
				return true;
			}
		}
	}
	return false;
}

/** Defer every sideshow tool schema until the sideshow skill is used. */
export default function sideshowLazyTools(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (sessionAlreadyUsedSideshow(ctx)) {
			activateSideshowTools(pi);
			return;
		}
		deactivateSideshowTools(pi);
	});

	pi.on("input", (event) => {
		if (isSideshowSkillCommand(event.text)) {
			activateSideshowTools(pi);
		}
		return { action: "continue" };
	});

	pi.on("before_agent_start", (event) => {
		if (!isExpandedSideshowSkillPrompt(event.prompt)) return;
		activateSideshowTools(pi);
	});
}
