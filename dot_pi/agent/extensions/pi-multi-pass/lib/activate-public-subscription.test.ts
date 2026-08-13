import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activatePublicSubscription } from "./activate-public-subscription.ts";

const work = { provider: "openai-codex", index: 2, label: "codex-work" };
const personal = { provider: "openai-codex", index: 3, label: "codex-personal" };
const workCred = { type: "oauth", access: "work" };
const personalCred = { type: "oauth", access: "personal" };
const originalCred = { type: "oauth", access: "original" };

function tempFiles(): { authPath: string; configPath: string } {
	const dir = mkdtempSync(join(tmpdir(), "multi-pass-public-"));
	return {
		authPath: join(dir, "auth.json"),
		configPath: join(dir, "multi-pass.json"),
	};
}

test("switching to codex-personal copies that slot onto openai-codex", () => {
	const files = tempFiles();
	writeFileSync(
		files.authPath,
		`${JSON.stringify({
			"openai-codex": workCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		}, null, 2)}\n`,
	);
	writeFileSync(files.configPath, "{}\n");

	const result = activatePublicSubscription({
		files,
		subscriptions: [work, personal],
		activeSlots: { "openai-codex": 2 },
		providerName: "codex-personal",
		builtinProviders: ["openai-codex"],
	});

	assert.equal(result._tag, "ok");
	if (result._tag !== "ok") return;
	assert.equal(result.kind, "slot");
	assert.equal(result.provider, "openai-codex");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex"], personalCred);
	assert.deepEqual(auth["openai-codex#2"], workCred);
	assert.deepEqual(JSON.parse(readFileSync(files.configPath, "utf-8")).activeSlots, {
		"openai-codex": 3,
	});
});

test("switching to openai-codex restores the parked original login", () => {
	const files = tempFiles();
	writeFileSync(
		files.authPath,
		`${JSON.stringify({
			"openai-codex": workCred,
			"openai-codex#1": originalCred,
			"openai-codex#2": workCred,
		}, null, 2)}\n`,
	);
	writeFileSync(files.configPath, "{}\n");

	const result = activatePublicSubscription({
		files,
		subscriptions: [work],
		activeSlots: { "openai-codex": 2 },
		providerName: "openai-codex",
		builtinProviders: ["openai-codex"],
	});

	assert.equal(result._tag, "ok");
	if (result._tag !== "ok") return;
	assert.equal(result.kind, "original");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex"], originalCred);
	assert.deepEqual(auth["openai-codex#2"], workCred);
});
