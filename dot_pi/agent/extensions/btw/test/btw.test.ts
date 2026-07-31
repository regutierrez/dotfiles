import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
	commandForFork,
	inheritedRuntimeOptions,
	parseBtwCommand,
	previewAnswer,
	resolveBtwSlotIndex,
	selectBtwModel,
	shellQuote,
	shouldDisplayBtwRecord,
} from "../index.ts";

test("parses BTW questions, slot selection, and lifecycle actions", () => {
	assert.deepEqual(parseBtwCommand(""), { action: "show" });
	assert.deepEqual(parseBtwCommand("why did this fail?"), {
		action: "ask",
		question: "why did this fail?",
	});
	assert.deepEqual(parseBtwCommand("2 why did this fail?"), {
		action: "ask",
		slot: 2,
		question: "why did this fail?",
	});
	assert.deepEqual(parseBtwCommand("#2 why did this fail?"), {
		action: "ask",
		slot: 2,
		question: "why did this fail?",
	});
	assert.deepEqual(parseBtwCommand("2"), { action: "select", slot: 2 });
	assert.deepEqual(parseBtwCommand("inject"), { action: "inject" });
	assert.deepEqual(parseBtwCommand("discard"), { action: "clear" });
	assert.deepEqual(parseBtwCommand("fork"), { action: "fork" });
	assert.deepEqual(parseBtwCommand("inject 2"), { action: "inject", slot: 2 });
	assert.deepEqual(parseBtwCommand("2 discard"), { action: "clear", slot: 2 });
	assert.deepEqual(parseBtwCommand("discard 1"), { action: "clear", slot: 1 });
	assert.deepEqual(parseBtwCommand("#3 fork"), { action: "fork", slot: 3 });
	assert.equal(parseBtwCommand("2.1 continue").action, "error");
	assert.equal(parseBtwCommand("0 nope").action, "error");
	assert.equal(parseBtwCommand("inject 0").action, "error");
});

test("resolves 1-based slot numbers onto distinct in-memory indexes", () => {
	assert.equal(resolveBtwSlotIndex(undefined, 0), 0);
	assert.equal(resolveBtwSlotIndex(undefined, 3), 3);
	assert.equal(resolveBtwSlotIndex(1, 3), 0);
	assert.equal(resolveBtwSlotIndex(2, 0), 1);
	assert.equal(resolveBtwSlotIndex(9, 0), 8);
});

test("shell-quotes fork arguments without changing their contents", () => {
	const values = ["plain", "has spaces", "it's quoted", "line one\nline two", "$(touch /tmp/nope)"];
	for (const value of values) {
		const output = execFileSync("/bin/sh", ["-c", `printf %s ${shellQuote(value)}`], { encoding: "utf8" });
		assert.equal(output, value);
	}
});

test("inherits the main model and falls back when an override is unavailable", () => {
	type SelectedModel = NonNullable<Parameters<typeof selectBtwModel>[0]>;
	const mainRef = { provider: "openai-codex", id: "gpt-main" };
	const alternateRef = { provider: "cursor", id: "grok-side" };
	const main = mainRef as unknown as SelectedModel;
	const alternate = alternateRef as unknown as SelectedModel;
	const registry = {
		find: (provider: string, id: string) =>
			provider === alternateRef.provider && id === alternateRef.id ? alternate : undefined,
		hasConfiguredAuth: (model: SelectedModel) => model === alternate,
	};

	assert.equal(selectBtwModel(main, undefined, registry)?.model, main);
	assert.equal(selectBtwModel(main, "cursor/grok-side", registry)?.model, alternate);
	const fallback = selectBtwModel(main, "cursor/missing", registry);
	assert.equal(fallback?.model, main);
	assert.match(fallback?.warning ?? "", /unavailable/u);
});

test("reuses Pi's bootstrapped model runtime when available", () => {
	const runtime = { provider: "bootstrapped" };
	assert.deepEqual(inheritedRuntimeOptions({ runtime }), { modelRuntime: runtime });
	const legacyRegistry = { find: () => undefined };
	assert.deepEqual(inheritedRuntimeOptions(legacyRegistry), { modelRegistry: legacyRegistry });
});

test("builds an interactive pi --fork command", () => {
	const command = commandForFork("/tmp/main session.jsonl", "BTW: user's question", "Answer: it's safe");
	assert.match(command, /^pi --fork /u);
	assert.match(command, / --name /u);
	assert.ok(command.includes(shellQuote("/tmp/main session.jsonl")));
	assert.ok(command.includes(shellQuote("BTW: user's question")));
	assert.ok(command.includes(shellQuote("Answer: it's safe")));
});

test("hides BTW results after their generation is discarded", () => {
	const generation = "gen-1";
	const result = { kind: "result" as const, generation };
	const cleared = { kind: "cleared" as const, generation };
	const active = new Set<string>();
	const discarded = new Set([generation]);

	assert.equal(shouldDisplayBtwRecord(result, active), true);
	assert.equal(shouldDisplayBtwRecord(result, discarded), false);
	assert.equal(shouldDisplayBtwRecord(cleared, active), false);
	assert.equal(shouldDisplayBtwRecord(undefined, active), false);
});

test("previews answers with line and character limits", () => {
	assert.equal(previewAnswer("one\ntwo\nthree\nfour", 2), "one\ntwo\n…");
	assert.equal(previewAnswer("short answer"), "short answer");
	assert.equal(previewAnswer("abcdefghij", 3, 5), "abcd…");
});
