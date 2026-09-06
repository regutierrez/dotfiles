/**
 * Herdr Agents-panel metadata for the `/pi-rename` session-name mirror: build
 * `herdr pane report-metadata` argv that sets `pi - <name>` as the pane's
 * display-agent comment (split across the first name row and `$name2`) or
 * clears it. Pure helpers; the session name itself lives in pi-session-name.ts.
 */

export const HERDR_METADATA_SOURCE = "user:pi-rename";
/** Pre-rename source id; cleared once per process so old tokens do not linger. */
export const HERDR_LEGACY_METADATA_SOURCE = "user:herdr-rename";
export const HERDR_APPLIES_TO_SOURCE = "herdr:pi";
export const HERDR_AGENT_GUARD = "pi";
export const HERDR_DISPLAY_AGENT_PREFIX = `${HERDR_AGENT_GUARD} - `;
/** First Agents-panel name row. Fits a 32-column sidebar after the 3-space indent. */
export const HERDR_NAME_ROW_MAX_CHARS = 29;
export const HERDR_NAME1_TOKEN = "name1";
export const HERDR_NAME2_TOKEN = "name2";

export type HerdrPaneEnv =
	| { ok: true; paneId: string; herdrBin: string }
	| { ok: false; reason: string };

/** True only inside a Herdr-managed pane (`HERDR_ENV=1` plus a pane id). */
export function isHerdrPaneSession(env: NodeJS.ProcessEnv): boolean {
	return resolveHerdrPaneEnv(env).ok;
}

/**
 * Resolve the Herdr pane this Pi process can mirror to.
 * Uses `HERDR_BIN_PATH` when set so the report hits the same binary as the pane.
 */
export function resolveHerdrPaneEnv(env: NodeJS.ProcessEnv): HerdrPaneEnv {
	if (env.HERDR_ENV !== "1") {
		return { ok: false, reason: "pi-rename: not inside a Herdr pane" };
	}
	const paneId = env.HERDR_PANE_ID?.trim();
	if (!paneId) {
		return { ok: false, reason: "pi-rename: HERDR_PANE_ID is missing" };
	}
	const herdrBin = env.HERDR_BIN_PATH?.trim() || "herdr";
	return { ok: true, paneId, herdrBin };
}

/** Prefix a session name for the Agents panel. Keep an existing `pi - ` prefix. */
export function formatHerdrDisplayAgent(sessionName: string): string {
	if (sessionName.startsWith(HERDR_DISPLAY_AGENT_PREFIX)) return sessionName;
	return `${HERDR_DISPLAY_AGENT_PREFIX}${sessionName}`;
}

export type HerdrDisplayAgentNameRows = {
	name1: string;
	name2?: string;
};

/**
 * Split a `pi - <name>` display-agent comment into `$name1` and `$name2`.
 * Prefers a word break at or before the first Agents-panel name row.
 */
export function splitHerdrDisplayAgentRows(comment: string): HerdrDisplayAgentNameRows {
	if (comment.length <= HERDR_NAME_ROW_MAX_CHARS) {
		return { name1: comment };
	}
	const window = comment.slice(0, HERDR_NAME_ROW_MAX_CHARS + 1);
	const lastSpace = window.lastIndexOf(" ");
	const splitAt = lastSpace > 0 ? lastSpace : HERDR_NAME_ROW_MAX_CHARS;
	const name1 = comment.slice(0, splitAt).trimEnd();
	const name2 = comment.slice(splitAt).trimStart();
	return name2 ? { name1, name2 } : { name1 };
}

/**
 * CLI argv for `herdr pane report-metadata`.
 * `--display-agent` is `pi - <name>`, split across the first name row and `$name2`.
 * `$name2` is the wrap row and stays hidden until the prefixed label overflows.
 * Pass `source` to target another metadata source (legacy cleanup).
 */
export function buildHerdrDisplayAgentReportArgs(options: {
	paneId: string;
	action: "set" | "clear";
	displayAgent?: string;
	source?: string;
}): string[] {
	const args = [
		"pane",
		"report-metadata",
		options.paneId,
		"--source",
		options.source ?? HERDR_METADATA_SOURCE,
		"--agent",
		HERDR_AGENT_GUARD,
		"--applies-to-source",
		HERDR_APPLIES_TO_SOURCE,
	];
	if (options.action === "clear") {
		args.push(
			"--clear-display-agent",
			"--clear-token",
			HERDR_NAME1_TOKEN,
			"--clear-token",
			HERDR_NAME2_TOKEN,
		);
		return args;
	}
	if (!options.displayAgent) {
		throw new Error("pi-rename: display-agent comment is empty");
	}
	const rows = splitHerdrDisplayAgentRows(formatHerdrDisplayAgent(options.displayAgent));
	args.push(
		"--display-agent",
		rows.name1,
		"--clear-token",
		HERDR_NAME1_TOKEN,
	);
	if (rows.name2) {
		args.push("--token", `${HERDR_NAME2_TOKEN}=${rows.name2}`);
	} else {
		args.push("--clear-token", HERDR_NAME2_TOKEN);
	}
	return args;
}
