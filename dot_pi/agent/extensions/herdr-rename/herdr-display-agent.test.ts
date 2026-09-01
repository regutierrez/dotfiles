import assert from "node:assert/strict";
import test from "node:test";
import {
	buildHerdrDisplayAgentReportArgs,
	clipHerdrRenamePrompt,
	extractLatestUserPromptText,
	fallbackHerdrDisplayAgent,
	formatHerdrRenameDisplayAgent,
	HERDR_DISPLAY_AGENT_MAX_CHARS,
	HERDR_NAME_ROW_MAX_CHARS,
	HERDR_RENAME_APPLIES_TO_SOURCE,
	HERDR_RENAME_DEFAULT_MODEL_REF,
	HERDR_RENAME_DISPLAY_PREFIX,
	HERDR_RENAME_NAME1_TOKEN,
	HERDR_RENAME_NAME2_TOKEN,
	HERDR_RENAME_PROMPT_MAX_CHARS,
	HERDR_RENAME_SOURCE,
	isHerdrRenameSession,
	normalizeHerdrDisplayAgent,
	parseHerdrRenameCommand,
	parseProviderModelRef,
	resolveHerdrRenamePaneEnv,
	selectHerdrRenameModel,
	splitHerdrDisplayAgentRows,
} from "./herdr-display-agent.ts";

test("requires HERDR_ENV=1 and a pane id", () => {
	assert.equal(isHerdrRenameSession({}), false);
	assert.deepEqual(resolveHerdrRenamePaneEnv({}), {
		ok: false,
		reason: "herdr-rename: not inside a Herdr session",
	});
	assert.deepEqual(resolveHerdrRenamePaneEnv({ HERDR_ENV: "1" }), {
		ok: false,
		reason: "herdr-rename: HERDR_PANE_ID is missing",
	});
	assert.deepEqual(resolveHerdrRenamePaneEnv({ HERDR_ENV: "1", HERDR_PANE_ID: "w2N:pZ" }), {
		ok: true,
		paneId: "w2N:pZ",
		herdrBin: "herdr",
	});
	assert.deepEqual(
		resolveHerdrRenamePaneEnv({
			HERDR_ENV: "1",
			HERDR_PANE_ID: "w2N:pZ",
			HERDR_BIN_PATH: "/opt/herdr",
		}),
		{ ok: true, paneId: "w2N:pZ", herdrBin: "/opt/herdr" },
	);
});

test("parses /herdr-rename summarize, set, and --clear", () => {
	assert.deepEqual(parseHerdrRenameCommand(""), { action: "summarize" });
	assert.deepEqual(parseHerdrRenameCommand("  "), { action: "summarize" });
	assert.deepEqual(parseHerdrRenameCommand("--clear"), { action: "clear" });
	assert.deepEqual(parseHerdrRenameCommand("review auth middleware"), {
		action: "set",
		comment: "review auth middleware",
	});
	assert.equal(parseHerdrRenameCommand("--nope").action, "error");
	assert.equal(parseHerdrRenameCommand("-x").action, "error");
});

test("normalizes display-agent comments to the 64-character naming cap", () => {
	assert.equal(normalizeHerdrDisplayAgent("  review auth  "), "review auth");
	assert.equal(normalizeHerdrDisplayAgent('"review auth"'), "review auth");
	assert.equal(normalizeHerdrDisplayAgent("first line\nsecond"), "first line");
	assert.equal(normalizeHerdrDisplayAgent("   \n"), undefined);
	assert.equal(HERDR_DISPLAY_AGENT_MAX_CHARS, 64);
	const long = "word ".repeat(20).trim();
	const normalized = normalizeHerdrDisplayAgent(long);
	assert.ok(normalized);
	assert.equal(normalized.length, HERDR_DISPLAY_AGENT_MAX_CHARS);
	assert.equal(normalizeHerdrDisplayAgent("x".repeat(80))?.length, 64);
});

test("splits a long display-agent comment into $name1 and $name2 rows", () => {
	assert.deepEqual(splitHerdrDisplayAgentRows("review auth middleware"), {
		name1: "review auth middleware",
	});
	const twoRows = "show last user prompt in herdr agents panel";
	assert.ok(twoRows.length > HERDR_NAME_ROW_MAX_CHARS);
	assert.deepEqual(splitHerdrDisplayAgentRows(twoRows), {
		name1: "show last user prompt in",
		name2: "herdr agents panel",
	});
	assert.deepEqual(splitHerdrDisplayAgentRows("a".repeat(40)), {
		name1: "a".repeat(HERDR_NAME_ROW_MAX_CHARS),
		name2: "a".repeat(40 - HERDR_NAME_ROW_MAX_CHARS),
	});
});

test("extracts the latest user prompt, not earlier or assistant text", () => {
	assert.equal(
		extractLatestUserPromptText([
			{ type: "message", message: { role: "user", content: "old ask" } },
			{ type: "message", message: { role: "assistant", content: "working" } },
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "latest ask" }] } },
		]),
		"latest ask",
	);
	assert.equal(
		extractLatestUserPromptText([{ type: "message", message: { role: "assistant", content: "only assistant" } }]),
		undefined,
	);
});

test("clips long prompts before the Luna rename call", () => {
	const prompt = "ask ".repeat(500);
	const clipped = clipHerdrRenamePrompt(prompt);
	assert.ok(clipped.endsWith("…"));
	assert.ok(clipped.length <= HERDR_RENAME_PROMPT_MAX_CHARS + 1);
});

test("selects openai-codex/gpt-5.6-luna, then any authorized luna", () => {
	const luna = { provider: "openai-codex", id: "gpt-5.6-luna" };
	const otherLuna = { provider: "codex-work", id: "gpt-5.6-luna" };
	const sol = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const registry = {
		find: (provider: string, modelId: string) =>
			provider === luna.provider && modelId === luna.id ? luna : undefined,
		hasConfiguredAuth: (model: typeof luna) => model === luna,
		getAvailable: () => [sol, otherLuna],
	};

	assert.deepEqual(selectHerdrRenameModel(registry), {
		model: luna,
		thinkingLevel: "low",
	});

	const fallbackRegistry = {
		find: () => undefined,
		hasConfiguredAuth: (model: typeof otherLuna) => model === otherLuna,
		getAvailable: () => [sol, otherLuna],
	};
	assert.deepEqual(selectHerdrRenameModel(fallbackRegistry), {
		model: otherLuna,
		thinkingLevel: "low",
	});

	assert.equal("error" in selectHerdrRenameModel({ find: () => undefined, hasConfiguredAuth: () => false }), true);
	assert.deepEqual(parseProviderModelRef(HERDR_RENAME_DEFAULT_MODEL_REF), {
		provider: "openai-codex",
		modelId: "gpt-5.6-luna",
	});
});

test("prepends the Pi agent name to the display-agent comment", () => {
	assert.equal(HERDR_RENAME_DISPLAY_PREFIX, "pi - ");
	assert.equal(formatHerdrRenameDisplayAgent("review auth middleware"), "pi - review auth middleware");
	assert.equal(
		formatHerdrRenameDisplayAgent("pi - review auth middleware"),
		"pi - review auth middleware",
	);
});

test("builds report-metadata argv that sets or clears display-agent and name rows", () => {
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({
			paneId: "w2N:pZ",
			action: "set",
			displayAgent: "review auth middleware",
		}),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			HERDR_RENAME_SOURCE,
			"--agent",
			"pi",
			"--applies-to-source",
			HERDR_RENAME_APPLIES_TO_SOURCE,
			"--display-agent",
			"pi - review auth middleware",
			"--clear-token",
			HERDR_RENAME_NAME1_TOKEN,
			"--clear-token",
			HERDR_RENAME_NAME2_TOKEN,
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
			HERDR_RENAME_SOURCE,
			"--agent",
			"pi",
			"--applies-to-source",
			HERDR_RENAME_APPLIES_TO_SOURCE,
			"--display-agent",
			"pi - show last user prompt in",
			"--clear-token",
			HERDR_RENAME_NAME1_TOKEN,
			"--token",
			`${HERDR_RENAME_NAME2_TOKEN}=herdr agents panel`,
		],
	);
	assert.deepEqual(
		buildHerdrDisplayAgentReportArgs({ paneId: "w2N:pZ", action: "clear" }),
		[
			"pane",
			"report-metadata",
			"w2N:pZ",
			"--source",
			HERDR_RENAME_SOURCE,
			"--agent",
			"pi",
			"--applies-to-source",
			HERDR_RENAME_APPLIES_TO_SOURCE,
			"--clear-display-agent",
			"--clear-token",
			HERDR_RENAME_NAME1_TOKEN,
			"--clear-token",
			HERDR_RENAME_NAME2_TOKEN,
		],
	);
	assert.equal(fallbackHerdrDisplayAgent("  clip me  "), "clip me");
});
