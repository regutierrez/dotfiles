/** Build Herdr display metadata from Pi's native session name. */

export const HERDR_SESSION_NAME_SOURCE = "user:herdr-rename";
export const HERDR_PI_AGENT = "pi";
export const HERDR_PI_SESSION_NAME_PREFIX = `${HERDR_PI_AGENT} - `;
export const HERDR_LEGACY_NAME1_TOKEN = "name1";
export const HERDR_LEGACY_NAME2_TOKEN = "name2";

export type HerdrRenamePaneEnv =
	| { ok: true; paneId: string; herdrBin: string }
	| { ok: false; reason: string };

/** Resolve the Herdr pane that contains this Pi process. */
export function resolveHerdrRenamePaneEnv(env: NodeJS.ProcessEnv): HerdrRenamePaneEnv {
	if (env.HERDR_ENV !== "1") {
		return { ok: false, reason: "herdr-session-name: not inside a Herdr session" };
	}
	const paneId = env.HERDR_PANE_ID?.trim();
	if (!paneId) {
		return { ok: false, reason: "herdr-session-name: HERDR_PANE_ID is missing" };
	}
	const herdrBin = env.HERDR_BIN_PATH?.trim() || "herdr";
	return { ok: true, paneId, herdrBin };
}

/** Format a named Pi session for Herdr. An unnamed session has no override. */
export function formatHerdrPiSessionDisplayName(sessionName: string | undefined): string | undefined {
	const normalizedName = sessionName?.replace(/\s+/gu, " ").replace(/[\u0000-\u001f\u007f]/gu, "").trim();
	return normalizedName ? `${HERDR_PI_SESSION_NAME_PREFIX}${normalizedName}` : undefined;
}

/** Build `herdr pane report-metadata` arguments for the current Pi session name. */
export function buildHerdrPiSessionNameReportArgs(options: {
	paneId: string;
	sessionName?: string;
}): string[] {
	const args = [
		"pane",
		"report-metadata",
		options.paneId,
		"--source",
		HERDR_SESSION_NAME_SOURCE,
		"--agent",
		HERDR_PI_AGENT,
	];
	const displayName = formatHerdrPiSessionDisplayName(options.sessionName);
	if (displayName) {
		args.push("--display-agent", displayName);
	} else {
		args.push("--clear-display-agent");
	}
	args.push(
		"--clear-token",
		HERDR_LEGACY_NAME1_TOKEN,
		"--clear-token",
		HERDR_LEGACY_NAME2_TOKEN,
	);
	return args;
}
