/**
 * Keep follow-up sideshow tools inactive until the first design-guide or
 * publish call. Their schemas are large and unused on most first turns.
 *
 * Image uploads stay locked until that first call, so a first-card image
 * needs `sideshow_get_design_guide` before `sideshow_upload_asset`.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SIDESHOW_LAZY_TOOL_NAMES = [
	"sideshow_update_surface",
	"sideshow_wait_for_feedback",
	"sideshow_reply_to_user",
	"sideshow_list_surfaces",
	"sideshow_upload_asset",
] as const;

const SIDESHOW_UNLOCK_TOOL_NAMES = [
	"sideshow_get_design_guide",
	"sideshow_publish_surface",
] as const;

const SIDESHOW_UNLOCK_TOOL_NAME_SET = new Set<string>(SIDESHOW_UNLOCK_TOOL_NAMES);

const SIDESHOW_TOOL_NAMES = new Set<string>([
	...SIDESHOW_LAZY_TOOL_NAMES,
	...SIDESHOW_UNLOCK_TOOL_NAMES,
]);

function isSideshowToolName(name: string): boolean {
	return SIDESHOW_TOOL_NAMES.has(name);
}

function registeredSideshowLazyToolNames(pi: ExtensionAPI): string[] {
	const registered = new Set(pi.getAllTools().map((tool) => tool.name));
	return SIDESHOW_LAZY_TOOL_NAMES.filter((name) => registered.has(name));
}

/** Hide follow-up sideshow tools from the first-turn active set. */
function deactivateSideshowLazyTools(pi: ExtensionAPI): void {
	const lazy = new Set(registeredSideshowLazyToolNames(pi));
	if (lazy.size === 0) return;
	const active = pi.getActiveTools();
	const next = active.filter((name) => !lazy.has(name));
	if (next.length !== active.length) {
		pi.setActiveTools(next);
	}
}

/** Add follow-up sideshow tools without removing anything already active. */
function activateSideshowLazyTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const missing = registeredSideshowLazyToolNames(pi).filter((name) => !active.includes(name));
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
			if (
				part &&
				typeof part === "object" &&
				"type" in part &&
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

/** Defer unused sideshow tool schemas until the first sideshow call. */
export default function sideshowLazyTools(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (sessionAlreadyUsedSideshow(ctx)) {
			activateSideshowLazyTools(pi);
			return;
		}
		deactivateSideshowLazyTools(pi);
	});

	pi.on("tool_call", (event) => {
		if (!SIDESHOW_UNLOCK_TOOL_NAME_SET.has(event.toolName)) return;
		activateSideshowLazyTools(pi);
	});
}
