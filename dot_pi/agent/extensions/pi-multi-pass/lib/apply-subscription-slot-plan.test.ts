import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	applyActivateSubscriptionSlot,
	applyLogoutSubscriptionSlot,
	applyRestoreOriginalSubscriptionSlot,
	applySubscriptionSlotLogin,
} from "./apply-subscription-slot-plan.ts";

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
const originalCred = {
	type: "oauth",
	access: "original-access",
	refresh: "original-refresh",
	expires: 50,
};

function tempFiles(): { authPath: string; configPath: string } {
	const dir = mkdtempSync(join(tmpdir(), "multi-pass-apply-"));
	return {
		authPath: join(dir, "auth.json"),
		configPath: join(dir, "multi-pass.json"),
	};
}

test("switch copies the selected extra slot onto openai-codex", () => {
	const files = tempFiles();
	writeFileSync(
		files.authPath,
		`${JSON.stringify({
			"openai-codex": workCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		}, null, 2)}\n`,
	);
	writeFileSync(files.configPath, `${JSON.stringify({ subscriptions: [work, personal] }, null, 2)}\n`);

	const result = applyActivateSubscriptionSlot({
		files,
		subscriptions: [work, personal],
		activeSlots: { "openai-codex": 2 },
		provider: "openai-codex",
		index: 3,
	});

	assert.equal(result._tag, "ok");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex"], personalCred);
	assert.deepEqual(auth["openai-codex#2"], workCred);
	assert.deepEqual(JSON.parse(readFileSync(files.configPath, "utf-8")).activeSlots, {
		"openai-codex": 3,
	});
});

test("login stores the slot credential and activates it when none is active", () => {
	const files = tempFiles();
	writeFileSync(files.configPath, `${JSON.stringify({ subscriptions: [work] }, null, 2)}\n`);

	const result = applySubscriptionSlotLogin({
		files,
		subscriptions: [work],
		activeSlots: {},
		entry: work,
		credential: workCred,
	});

	assert.equal(result._tag, "ok");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex#2"], workCred);
	assert.deepEqual(auth["openai-codex"], workCred);
	assert.deepEqual(JSON.parse(readFileSync(files.configPath, "utf-8")).activeSlots, {
		"openai-codex": 2,
	});
});

test("login of the already-active slot refreshes the live openai-codex copy", () => {
	const files = tempFiles();
	writeFileSync(
		files.authPath,
		`${JSON.stringify({
			"openai-codex": workCred,
			"openai-codex#2": workCred,
		}, null, 2)}\n`,
	);
	writeFileSync(files.configPath, `${JSON.stringify({
		subscriptions: [work],
		activeSlots: { "openai-codex": 2 },
	}, null, 2)}\n`);
	const refreshed = {
		type: "oauth",
		access: "work-access-new",
		refresh: "work-refresh-new",
		expires: 400,
	};

	const result = applySubscriptionSlotLogin({
		files,
		subscriptions: [work],
		activeSlots: { "openai-codex": 2 },
		entry: work,
		credential: refreshed,
	});

	assert.equal(result._tag, "ok");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex#2"], refreshed);
	assert.deepEqual(auth["openai-codex"], refreshed);
});

test("logout of the last extra slot restores the parked original login", () => {
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

	const result = applyLogoutSubscriptionSlot({
		files,
		subscriptions: [work],
		activeSlots: { "openai-codex": 2 },
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(result._tag, "ok");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex"], originalCred);
	assert.equal(auth["openai-codex#2"], undefined);
});

test("restore original writes the extra slot back then copies slot 1 onto openai-codex", () => {
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

	const result = applyRestoreOriginalSubscriptionSlot({
		files,
		subscriptions: [work],
		activeSlots: { "openai-codex": 2 },
		provider: "openai-codex",
	});

	assert.equal(result._tag, "ok");
	const auth = JSON.parse(readFileSync(files.authPath, "utf-8"));
	assert.deepEqual(auth["openai-codex"], originalCred);
	assert.deepEqual(auth["openai-codex#2"], workCred);
	assert.deepEqual(JSON.parse(readFileSync(files.configPath, "utf-8")).activeSlots, {});
});
