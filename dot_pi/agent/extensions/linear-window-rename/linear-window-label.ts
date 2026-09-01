/**
 * Prepend `(TRI-1234)` to a Herdr window (tab) name when the starting user
 * prompt contains a Linear issue id or linear.app URL.
 * The space-local window number stays in front; `dotfiles.window-numbers` owns it.
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

/**
 * Split a Herdr window (tab) name into the leading space-local window number and the rest.
 * Strips repeated `3`, `3 rest`, `3: rest`, and `3-rest` prefixes. Leaves names such as `2fa work` alone.
 */
export function splitWindowNumberPrefix(label: string | undefined): { windowNumber?: number; rest: string } {
	let text = label?.trim() ?? "";
	let windowNumber: number | undefined;
	for (let attempt = 0; attempt < 8 && text; attempt += 1) {
		const onlyNumber = /^(\d+)$/.exec(text);
		if (onlyNumber) return { windowNumber: Number(onlyNumber[1]), rest: "" };
		const withRest = /^(\d+)(?::\s*|\s+|-)(.*)$/.exec(text);
		if (!withRest) break;
		windowNumber = Number(withRest[1]);
		text = withRest[2].trim();
	}
	return windowNumber === undefined ? { rest: text } : { windowNumber, rest: text };
}

/** True when the window-name rest already contains this Linear issue id. */
export function windowRestHasLinearIssue(rest: string, linearIssueId: string): boolean {
	const issue = normalizeLinearIssueId(linearIssueId);
	if (!issue) return false;
	const escaped = issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`).test(rest.toUpperCase());
}

/** Prepend `(TRI-1234)` to the window-name rest when that issue is not already present. */
export function prependLinearIssueToWindowRest(rest: string, linearIssueId: string): string {
	const issue = normalizeLinearIssueId(linearIssueId);
	const text = rest.trim();
	if (windowRestHasLinearIssue(text, issue)) return text;
	if (!text) return `(${issue})`;
	return `(${issue}) ${text}`;
}

/** Build `N (TRI-1234)` or `N (TRI-1234) rest` from the space-local window number. */
export function buildLinearWindowLabel(
	windowNumber: number,
	currentLabel: string | undefined,
	linearIssueId: string,
): string {
	const { rest } = splitWindowNumberPrefix(currentLabel);
	const nextRest = prependLinearIssueToWindowRest(rest, linearIssueId);
	return nextRest ? `${windowNumber} ${nextRest}` : String(windowNumber);
}

/** True when the Herdr window name should gain `(TRI-1234)` after the space-local window number. */
export function shouldRenameLinearWindow(
	currentLabel: string | undefined,
	windowNumber: number,
	linearIssueId: string,
): boolean {
	const label = currentLabel?.trim() ?? "";
	if (windowRestHasLinearIssue(label, linearIssueId)) return false;
	const nextLabel = buildLinearWindowLabel(windowNumber, currentLabel, linearIssueId);
	return label !== nextLabel;
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

/** CLI argv for `herdr tab rename <tabId> <N (TRI-1234)>`. */
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
