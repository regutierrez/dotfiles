/**
 * Rename a Herdr tab (window) from a bare number to `X: TRI-1234`
 * when the starting user prompt contains a Linear issue id or linear.app URL.
 * `X` is the 1-based window number inside the current space (workspace).
 */

export type HerdrWindowEnv =
	| { ok: true; tabId: string; workspaceId: string; herdrBin: string }
	| { ok: false; reason: string };

export type HerdrTabWindow = {
	tabId: string;
	label: string | undefined;
};

const LINEAR_ISSUE_URL_PATTERN =
	/(?:https?:\/\/)?(?:www\.)?linear\.app\/[^\s]*?\/issue\/([A-Za-z][A-Za-z0-9]+-\d+)/;
const LINEAR_ISSUE_ID_PATTERN = /\b([A-Za-z]{2,10}-\d+)\b/;

/** True only inside a Herdr-managed pane that has a tab id. */
export function isHerdrWindowSession(env: NodeJS.ProcessEnv): boolean {
	return resolveHerdrWindowEnv(env).ok;
}

/**
 * Resolve the Herdr tab (window) this Pi process can rename.
 * Uses `HERDR_BIN_PATH` when set so the rename hits the same binary as the pane.
 */
export function resolveHerdrWindowEnv(env: NodeJS.ProcessEnv): HerdrWindowEnv {
	if (env.HERDR_ENV !== "1") {
		return { ok: false, reason: "linear-window-rename: not inside a Herdr session" };
	}
	const tabId = env.HERDR_TAB_ID?.trim();
	if (!tabId) {
		return { ok: false, reason: "linear-window-rename: HERDR_TAB_ID is missing" };
	}
	const workspaceId = env.HERDR_WORKSPACE_ID?.trim() || workspaceIdFromTabId(tabId);
	if (!workspaceId) {
		return { ok: false, reason: "linear-window-rename: HERDR_WORKSPACE_ID is missing" };
	}
	const herdrBin = env.HERDR_BIN_PATH?.trim() || "herdr";
	return { ok: true, tabId, workspaceId, herdrBin };
}

/** Workspace id prefix of a Herdr tab id such as `w2N:tY`. */
export function workspaceIdFromTabId(tabId: string): string | undefined {
	const separator = tabId.indexOf(":");
	if (separator <= 0) return undefined;
	return tabId.slice(0, separator);
}

/**
 * Extract a Linear issue id such as TRI-1234 from prompt text or a linear.app URL.
 * A linear.app `/issue/` URL wins over a bare id. Returns uppercase `TEAM-123`.
 */
export function extractLinearIssueId(text: string): string | undefined {
	const urlMatch = text.match(LINEAR_ISSUE_URL_PATTERN);
	if (urlMatch?.[1]) return normalizeLinearIssueId(urlMatch[1]);
	const bareMatch = text.match(LINEAR_ISSUE_ID_PATTERN);
	if (bareMatch?.[1]) return normalizeLinearIssueId(bareMatch[1]);
	return undefined;
}

/** Uppercase a Linear issue id so TRI-1234 and tri-1234 become the same window label. */
export function normalizeLinearIssueId(raw: string): string {
	return raw.trim().toUpperCase();
}

/**
 * 1-based window number inside the current Herdr space.
 * Uses workspace tab-list order, not Herdr's public `tab.number`.
 */
export function localWindowNumberInSpace(tabs: readonly HerdrTabWindow[], tabId: string): number | undefined {
	const index = tabs.findIndex((tab) => tab.tabId === tabId);
	if (index === -1) return undefined;
	return index + 1;
}

/** Build the Herdr window (tab) name `X: TRI-1234` from the local window number and Linear issue id. */
export function buildLinearWindowLabel(windowNumber: number, linearIssueId: string): string {
	return `${windowNumber}: ${linearIssueId}`;
}

/**
 * True when the Herdr tab still shows as a bare number (or has no label)
 * and should become `X: TRI-1234`. Leaves custom names such as `dotfiles` alone.
 */
export function shouldRenameLinearWindow(
	currentLabel: string | undefined,
	windowNumber: number,
	linearIssueId: string,
): boolean {
	const nextLabel = buildLinearWindowLabel(windowNumber, linearIssueId);
	const label = currentLabel?.trim() ?? "";
	if (!label) return true;
	if (label === nextLabel) return false;
	return /^\d+$/.test(label);
}

/** Parse one Herdr tab object into id and window label. */
export function parseHerdrTabWindow(payload: unknown): HerdrTabWindow | undefined {
	if (!isRecord(payload)) return undefined;
	const result = isRecord(payload.result) ? payload.result : payload;
	const tab = isRecord(result.tab) ? result.tab : result;
	return parseHerdrTabRecord(tab);
}

/** Parse `herdr tab list` JSON into workspace tab order. */
export function parseHerdrTabList(payload: unknown): HerdrTabWindow[] {
	if (!isRecord(payload)) return [];
	const result = isRecord(payload.result) ? payload.result : payload;
	if (!Array.isArray(result.tabs)) return [];
	const tabs: HerdrTabWindow[] = [];
	for (const item of result.tabs) {
		const tab = parseHerdrTabRecord(item);
		if (tab) tabs.push(tab);
	}
	return tabs;
}

/** CLI argv for `herdr tab list --workspace <spaceId>`. */
export function buildLinearWindowListArgs(workspaceId: string): string[] {
	return ["tab", "list", "--workspace", workspaceId];
}

/** CLI argv for `herdr tab rename <tabId> <X: TRI-1234>`. */
export function buildLinearWindowRenameArgs(tabId: string, label: string): string[] {
	return ["tab", "rename", tabId, label];
}

function parseHerdrTabRecord(tab: unknown): HerdrTabWindow | undefined {
	if (!isRecord(tab)) return undefined;
	const tabId = typeof tab.tab_id === "string" ? tab.tab_id.trim() : "";
	if (!tabId) return undefined;
	return {
		tabId,
		label: typeof tab.label === "string" ? tab.label : undefined,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
