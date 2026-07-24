import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
	commandForFork,
	inheritedRuntimeOptions,
	parseBtwCommand,
	selectBtwModel,
	shellQuote,
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
	assert.deepEqual(parseBtwCommand("2"), { action: "select", slot: 2 });
	assert.deepEqual(parseBtwCommand("inject"), { action: "inject" });
	assert.deepEqual(parseBtwCommand("discard"), { action: "clear" });
	assert.deepEqual(parseBtwCommand("fork"), { action: "fork" });
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
