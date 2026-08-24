import assert from "node:assert/strict";
import test from "node:test";
import {
	buildHerdrPiSessionNameReportArgs,
	formatHerdrPiSessionDisplayName,
	HERDR_LEGACY_NAME1_TOKEN,
	HERDR_LEGACY_NAME2_TOKEN,
	HERDR_PI_AGENT,
	HERDR_SESSION_NAME_SOURCE,
	resolveHerdrRenamePaneEnv,
} from "./herdr-display-agent.ts";

test("requires a Herdr session and pane id", () => {
	assert.deepEqual(resolveHerdrRenamePaneEnv({}), {
		ok: false,
		reason: "herdr-session-name: not inside a Herdr session",
	});
	assert.deepEqual(resolveHerdrRenamePaneEnv({ HERDR_ENV: "1" }), {
		ok: false,
		reason: "herdr-session-name: HERDR_PANE_ID is missing",
	});
	assert.deepEqual(
		resolveHerdrRenamePaneEnv({
			HERDR_ENV: "1",
			HERDR_PANE_ID: "w2:p3",
			HERDR_BIN_PATH: "/opt/herdr",
		}),
		{ ok: true, paneId: "w2:p3", herdrBin: "/opt/herdr" },
	);
});

test("prepends the Pi harness name to a supplied session name", () => {
	assert.equal(formatHerdrPiSessionDisplayName("Review auth middleware"), "pi - Review auth middleware");
	assert.equal(formatHerdrPiSessionDisplayName("  Review   auth\nmiddleware  "), "pi - Review auth middleware");
	assert.equal(formatHerdrPiSessionDisplayName(undefined), undefined);
	assert.equal(formatHerdrPiSessionDisplayName("   "), undefined);
});

test("reports only the prefixed Pi session name", () => {
	const args = buildHerdrPiSessionNameReportArgs({
		paneId: "w2:p3",
		sessionName: "Review auth middleware",
	});
	assert.deepEqual(args, [
		"pane",
		"report-metadata",
		"w2:p3",
		"--source",
		HERDR_SESSION_NAME_SOURCE,
		"--agent",
		HERDR_PI_AGENT,
		"--display-agent",
		"pi - Review auth middleware",
		"--clear-token",
		HERDR_LEGACY_NAME1_TOKEN,
		"--clear-token",
		HERDR_LEGACY_NAME2_TOKEN,
	]);
	assert.equal(args.includes("--applies-to-source"), false);
});

test("clears the display override when the Pi session has no name", () => {
	assert.deepEqual(
		buildHerdrPiSessionNameReportArgs({ paneId: "w2:p3" }),
		[
			"pane",
			"report-metadata",
			"w2:p3",
			"--source",
			HERDR_SESSION_NAME_SOURCE,
			"--agent",
			HERDR_PI_AGENT,
			"--clear-display-agent",
			"--clear-token",
			HERDR_LEGACY_NAME1_TOKEN,
			"--clear-token",
			HERDR_LEGACY_NAME2_TOKEN,
		],
	);
});
