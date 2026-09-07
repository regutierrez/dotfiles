import assert from "node:assert/strict";
import test from "node:test";
import {
	buildHerdrDisplayAgentReportArgs,
	HERDR_AGENT_GUARD,
	HERDR_APPLIES_TO_SOURCE,
	HERDR_DISPLAY_AGENT_PREFIX,
	HERDR_LEGACY_METADATA_SOURCE,
	HERDR_METADATA_SOURCE,
	HERDR_NAME1_TOKEN,
	HERDR_NAME2_TOKEN,
	HERDR_NAME_ROW_MAX_CHARS,
	formatHerdrDisplayAgent,
	isHerdrPaneSession,
	resolveHerdrPaneEnv,
	splitHerdrDisplayAgentRows,
} from "./herdr-agent-metadata.ts";

test("requires HERDR_ENV=1 and a pane id", () => {
	assert.equal(isHerdrPaneSession({}), false);
	assert.deepEqual(resolveHerdrPaneEnv({}), {
		ok: false,
		reason: "pi-rename: not inside a Herdr pane",
	});
	assert.deepEqual(resolveHerdrPaneEnv({ HERDR_ENV: "1" }), {
		ok: false,
		reason: "pi-rename: HERDR_PANE_ID is missing",
	});
	assert.deepEqual(resolveHerdrPaneEnv({ HERDR_ENV: "1", HERDR_PANE_ID: "w2N:pZ" }), {
		ok: true,
		paneId: "w2N:pZ",
		herdrBin: "herdr",
	});
	assert.deepEqual(
		resolveHerdrPaneEnv({
			HERDR_ENV: "1",
			HERDR_PANE_ID: "w2N:pZ",
			HERDR_BIN_PATH: "/opt/herdr",
		}),
		{ ok: true, paneId: "w2N:pZ", herdrBin: "/opt/herdr" },
	);
});

test("prefixes the session name with the Pi agent guard", () => {
	assert.equal(HERDR_DISPLAY_AGENT_PREFIX, "pi - ");
	assert.equal(HERDR_AGENT_GUARD, "pi");
	assert.equal(formatHerdrDisplayAgent("review auth middleware"), "pi - review auth middleware");
	assert.equal(
		formatHerdrDisplayAgent("pi - review auth middleware"),
		"pi - review auth middleware",
	);
});

test("splits a long display-agent comment into $name1 and $name2 rows", () => {
	assert.deepEqual(splitHerdrDisplayAgentRows("pi - review auth middleware"), {
		name1: "pi - review auth middleware",
	});
	const twoRows = "pi - show last user prompt in herdr agents panel";
	assert.ok(twoRows.length > HERDR_NAME_ROW_MAX_CHARS);
	assert.deepEqual(splitHerdrDisplayAgentRows(twoRows), {
		name1: "pi - show last user prompt in",
		name2: "herdr agents panel",
	});
	assert.deepEqual(splitHerdrDisplayAgentRows("a".repeat(40)), {
		name1: "a".repeat(HERDR_NAME_ROW_MAX_CHARS),
		name2: "a".repeat(40 - HERDR_NAME_ROW_MAX_CHARS),
	});
});

test("builds report-metadata argv that sets or clears display-agent and name rows", () => {
	assert.equal(HERDR_METADATA_SOURCE, "user:pi-rename");
	assert.equal(HERDR_APPLIES_TO_SOURCE, "herdr:pi");
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({
			paneId: "w2N:pZ",
			action: "set",
			displayAgent: "review auth middleware",
			tabTitle: "TRI-1234",
		}),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			"user:pi-rename",
			"--agent",
			"pi",
			"--applies-to-source",
			"herdr:pi",
			"--title",
			"TRI-1234",
			"--display-agent",
			"pi - review auth middleware",
			"--clear-token",
			HERDR_NAME1_TOKEN,
			"--clear-token",
			HERDR_NAME2_TOKEN,
		],
	);
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({
			paneId: "w2N:pZ",
			action: "set",
			displayAgent: "show last user prompt in herdr agents panel",
		}),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			"user:pi-rename",
			"--agent",
			"pi",
			"--applies-to-source",
			"herdr:pi",
			"--clear-title",
			"--display-agent",
			"pi - show last user prompt in",
			"--clear-token",
			HERDR_NAME1_TOKEN,
			"--token",
			`${HERDR_NAME2_TOKEN}=herdr agents panel`,
		],
	);
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({ paneId: "w2N:pZ", action: "clear" }),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			"user:pi-rename",
			"--agent",
			"pi",
			"--applies-to-source",
			"herdr:pi",
			"--clear-title",
			"--clear-display-agent",
			"--clear-token",
			HERDR_NAME1_TOKEN,
			"--clear-token",
			HERDR_NAME2_TOKEN,
		],
	);
});

test("targets the legacy user:herdr-rename source for cleanup", () => {
	assert.equal(HERDR_LEGACY_METADATA_SOURCE, "user:herdr-rename");
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({
			paneId: "w2N:pZ",
			action: "clear",
			source: HERDR_LEGACY_METADATA_SOURCE,
		}),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			"user:herdr-rename",
			"--agent",
			"pi",
			"--applies-to-source",
			"herdr:pi",
			"--clear-title",
			"--clear-display-agent",
			"--clear-token",
			HERDR_NAME1_TOKEN,
			"--clear-token",
			HERDR_NAME2_TOKEN,
		],
	);
});
