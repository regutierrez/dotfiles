import assert from "node:assert/strict";
import test from "node:test";
import {
	clipPiRenamePrompt,
	extractLinearIssueId,
	fallbackPiSessionTitles,
	normalizePiTabTitle,
	parsePiSessionTitles,
	PI_RENAME_TITLES_ENTRY,
	restorePiSessionTitles,
	extractLatestUserPromptText,
	fallbackPiSessionName,
	normalizePiSessionName,
	parsePiRenameCommand,
	parseProviderModelRef,
	PI_RENAME_MODEL_REF,
	PI_RENAME_PROMPT_MAX_CHARS,
	PI_SESSION_NAME_MAX_CHARS,
	selectPiRenameModel,
} from "./pi-session-name.ts";

test("parses /pi-rename summarize, set, and --clear", () => {
	assert.equal(PI_RENAME_MODEL_REF, "openai-codex/gpt-5.6-luna");
	assert.deepEqual(parsePiRenameCommand(""), { action: "summarize" });
	assert.deepEqual(parsePiRenameCommand("  "), { action: "summarize" });
	assert.deepEqual(parsePiRenameCommand("--clear"), { action: "clear" });
	assert.deepEqual(parsePiRenameCommand("review auth middleware"), {
		action: "set",
		comment: "review auth middleware",
	});
	assert.equal(parsePiRenameCommand("--nope").action, "error");
	assert.equal(parsePiRenameCommand("-x").action, "error");
	assert.match(parsePiRenameCommand("--nope").message, /^pi-rename: unknown flag/);
});

test("normalizes session names to the 64-character naming cap", () => {
	assert.equal(normalizePiSessionName("  review auth  "), "review auth");
	assert.equal(normalizePiSessionName('"review auth"'), "review auth");
	assert.equal(normalizePiSessionName("first line\nsecond"), "first line");
	assert.equal(normalizePiSessionName("   \n"), undefined);
	assert.equal(PI_SESSION_NAME_MAX_CHARS, 64);
	const long = "word ".repeat(20).trim();
	const normalized = normalizePiSessionName(long);
	assert.ok(normalized);
	assert.equal(normalized.length, PI_SESSION_NAME_MAX_CHARS);
	assert.equal(normalizePiSessionName("x".repeat(80))?.length, 64);
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
	const clipped = clipPiRenamePrompt(prompt);
	assert.ok(clipped.endsWith("…"));
	assert.ok(clipped.length <= PI_RENAME_PROMPT_MAX_CHARS + 1);
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

	assert.deepEqual(selectPiRenameModel(registry), {
		model: luna,
		thinkingLevel: "low",
	});

	const fallbackRegistry = {
		find: () => undefined,
		hasConfiguredAuth: (model: typeof otherLuna) => model === otherLuna,
		getAvailable: () => [sol, otherLuna],
	};
	assert.deepEqual(selectPiRenameModel(fallbackRegistry), {
		model: otherLuna,
		thinkingLevel: "low",
	});

	assert.equal("error" in selectPiRenameModel({ find: () => undefined, hasConfiguredAuth: () => false }), true);
	assert.deepEqual(parseProviderModelRef(PI_RENAME_MODEL_REF), {
		provider: "openai-codex",
		modelId: "gpt-5.6-luna",
	});
});

test("falls back to the clipped prompt as the session name", () => {
	assert.equal(fallbackPiSessionName("  clip me  "), "clip me");
});

test("extracts Linear IDs in either profile, preferring a URL over a bare ID", () => {
	assert.equal(extractLinearIssueId("hey, can you @rca TRI-1234"), "TRI-1234");
	assert.equal(extractLinearIssueId("please investigate AKKIO-99 today"), "AKKIO-99");
	assert.equal(extractLinearIssueId("tri-42 in the starting prompt"), "TRI-42");
	assert.equal(extractLinearIssueId("ENG-8 then https://linear.app/akkio/issue/TRI-9/foo"), "TRI-9");
	assert.equal(extractLinearIssueId("see linear.app/akkio/issue/ENG-7#comment-abc"), "ENG-7");
	assert.equal(extractLinearIssueId("email me at user@akkio.com"), undefined);
	assert.equal(extractLinearIssueId("no ticket in this prompt"), undefined);
});

test("parses distinct names and keeps the tab topic terse", () => {
	assert.deepEqual(parsePiSessionTitles(JSON.stringify({
		sessionName: "Fix login redirects after session expiry",
		tabTitle: "Login redirects",
	}), "fix the login flow"), {
		sessionName: "Fix login redirects after session expiry", tabTitle: "Login redirects",
	});
	assert.equal(normalizePiTabTitle("one two three four five", "no ticket"), "one two three four");
});

test("ticket in the full prompt overrides the model topic, even beyond the model input cap", () => {
	const prompt = `${"context ".repeat(300)} https://linear.app/akkio/issue/tri-1234/login`;
	assert.ok(!clipPiRenamePrompt(prompt).includes("tri-1234"));
	assert.deepEqual(parsePiSessionTitles('{"sessionName":"Fix login redirect","tabTitle":"Login bug"}', prompt), {
		sessionName: "Fix login redirect", tabTitle: "TRI-1234",
	});
});

test("invalid model output falls back without leaking JSON into names", () => {
	for (const raw of ["plain prose", "null", "[]", '{"sessionName":42}', '{"sessionName":"","tabTitle":""}', '{"sessionName":']) {
		assert.deepEqual(parsePiSessionTitles(raw, "Fix TRI-42 login redirect"), {
			sessionName: "Fix TRI-42 login redirect", tabTitle: "TRI-42",
		});
	}
	assert.deepEqual(fallbackPiSessionTitles("one two three four five"), {
		sessionName: "one two three four five", tabTitle: "one two three four",
	});
	assert.equal(fallbackPiSessionTitles(""), undefined);
});

test("restores the saved title only for its associated session name", () => {
	const entries = [{ type: "custom", customType: PI_RENAME_TITLES_ENTRY,
		data: { sessionName: "Fix login redirect", tabTitle: "TRI-42" } }];
	assert.deepEqual(restorePiSessionTitles(entries, "Fix login redirect"), entries[0].data);
	assert.deepEqual(restorePiSessionTitles(entries, "New manual name"), {
		sessionName: "New manual name", tabTitle: "New manual name",
	});
	assert.equal(restorePiSessionTitles(entries, undefined), undefined);
	assert.deepEqual(restorePiSessionTitles([...entries, {
		type: "custom", customType: PI_RENAME_TITLES_ENTRY, data: null,
	}], "Fix login redirect"), { sessionName: "Fix login redirect", tabTitle: "Fix login redirect" });
});
