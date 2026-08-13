import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapActiveSubscriptionSlots } from "./bootstrap-active-subscription-slots.ts";

const work = { provider: "openai-codex", index: 2, label: "codex-work" };
const personal = { provider: "openai-codex", index: 3, label: "codex-personal" };
const workCred = {
	type: "oauth",
	access: "work-access",
	refresh: "work-refresh",
	expires: 100,
};
const personalCred = {
	type: "oauth",
	access: "personal-access",
	refresh: "personal-refresh",
	expires: 200,
};
const xaiCred = {
	type: "oauth",
	access: "xai-access",
	refresh: "xai-refresh",
	expires: 300,
};

test("migrates clone-provider auth onto openai-codex and rewrites enabled models", () => {
	const dir = mkdtempSync(join(tmpdir(), "multi-pass-bootstrap-"));
	const authPath = join(dir, "auth.json");
	const configPath = join(dir, "multi-pass.json");
	const settingsPath = join(dir, "settings.json");

	writeFileSync(
		authPath,
		`${JSON.stringify({
			xai: xaiCred,
			"codex-work": workCred,
			"codex-personal": personalCred,
		}, null, 2)}\n`,
	);
	writeFileSync(
		configPath,
		`${JSON.stringify({
			subscriptions: [work, personal],
			pools: [],
			chains: [],
			presets: [],
		}, null, 2)}\n`,
	);
	writeFileSync(
		settingsPath,
		`${JSON.stringify({
			defaultProvider: "xai",
			enabledModels: [
				"xai/grok-4.6",
				"codex-work/gpt-5.6-sol",
				"codex-personal/gpt-5.6-luna",
			],
		}, null, 2)}\n`,
	);

	const result = bootstrapActiveSubscriptionSlots({
		authPath,
		configPath,
		settingsPath,
		providers: ["openai-codex"],
		subscriptions: [work, personal],
		activeSlots: {},
	});

	assert.equal(result.migratedAuth, true);
	assert.equal(result.rewrittenEnabledModels, true);
	assert.deepEqual(result.activeSlots, { "openai-codex": 2 });

	const auth = JSON.parse(readFileSync(authPath, "utf-8"));
	assert.deepEqual(auth.xai, xaiCred);
	assert.deepEqual(auth["openai-codex"], workCred);
	assert.deepEqual(auth["openai-codex#2"], workCred);
	assert.deepEqual(auth["openai-codex#3"], personalCred);
	assert.equal(auth["codex-work"], undefined);
	assert.equal(auth["codex-personal"], undefined);
	assert.equal(existsSync(`${authPath}.multipass-slot-bak`), true);

	const config = JSON.parse(readFileSync(configPath, "utf-8"));
	assert.deepEqual(config.activeSlots, { "openai-codex": 2 });
	assert.deepEqual(config.subscriptions, [work, personal]);

	const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
	assert.deepEqual(settings.enabledModels, [
		"xai/grok-4.6",
		"openai-codex/gpt-5.6-sol",
		"openai-codex/gpt-5.6-luna",
	]);
});
