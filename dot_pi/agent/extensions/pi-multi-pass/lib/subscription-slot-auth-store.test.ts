import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	applySubscriptionSlotAuthPlan,
	readSubscriptionSlotAuthSnapshot,
} from "./subscription-slot-auth-store.ts";

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

function tempAuthPath(): string {
	return join(mkdtempSync(join(tmpdir(), "multi-pass-auth-")), "auth.json");
}

test("reads an empty snapshot when auth.json is missing", () => {
	assert.deepEqual(readSubscriptionSlotAuthSnapshot(join(tmpdir(), "missing-auth.json")), {});
});

test("applies writes without dropping unrelated provider credentials", () => {
	const authPath = tempAuthPath();
	writeFileSync(
		authPath,
		`${JSON.stringify({ xai: xaiCred, "codex-work": workCred }, null, 2)}\n`,
	);

	const snapshot = applySubscriptionSlotAuthPlan(authPath, {
		writes: [
			{ key: "openai-codex#2", credential: workCred },
			{ key: "openai-codex", credential: workCred },
		],
		deletes: [{ key: "codex-work" }],
	});

	assert.deepEqual(snapshot, {
		xai: xaiCred,
		"openai-codex#2": workCred,
		"openai-codex": workCred,
	});
	assert.deepEqual(JSON.parse(readFileSync(authPath, "utf-8")), snapshot);
});

test("preserves auth entries that use an unknown credential shape", () => {
	const authPath = tempAuthPath();
	const unknownCredential = { apiKey: "unknown-provider-key" };
	writeFileSync(
		authPath,
		`${JSON.stringify({ "unknown-provider": unknownCredential }, null, 2)}\n`,
	);

	const snapshot = applySubscriptionSlotAuthPlan(authPath, {
		writes: [{ key: "openai-codex", credential: workCred }],
	});

	assert.deepEqual(snapshot, { "openai-codex": workCred });
	assert.deepEqual(JSON.parse(readFileSync(authPath, "utf-8")), {
		"unknown-provider": unknownCredential,
		"openai-codex": workCred,
	});
});

test("does not delete a key that the same plan just wrote", () => {
	const authPath = tempAuthPath();
	const snapshot = applySubscriptionSlotAuthPlan(authPath, {
		writes: [{ key: "openai-codex", credential: personalCred }],
		deletes: [{ key: "openai-codex" }],
	});

	assert.deepEqual(snapshot, { "openai-codex": personalCred });
});
