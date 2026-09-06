import assert from "node:assert/strict";
import test from "node:test";
import {
	clipPiRenamePrompt,
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
