import assert from "node:assert/strict";
import test from "node:test";
import {
	lookupSubscriptionAuth,
	publicNameForActiveSlot,
	publicSubscriptionHasAuth,
	resolvePublicSubscriptionTarget,
} from "./subscription-slot-auth-lookup.ts";

const work = { provider: "openai-codex", index: 2, label: "codex-work" };
const personal = { provider: "openai-codex", index: 3, label: "codex-personal" };
const workCred = { type: "oauth", access: "work" };
const personalCred = { type: "oauth", access: "personal" };

test("openai-codex reads the live built-in key, not a clone provider", () => {
	const lookup = lookupSubscriptionAuth({
		providerName: "openai-codex",
		subscriptions: [work, personal],
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": workCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		},
		builtinProviders: ["openai-codex"],
	});
	assert.equal(lookup.kind, "live");
	assert.equal(lookup.storageKey, "openai-codex");
	assert.deepEqual(lookup.credential, workCred);
});

test("codex-work reads the private slot key even when it is not active", () => {
	const lookup = lookupSubscriptionAuth({
		providerName: "codex-work",
		subscriptions: [work, personal],
		activeSlots: { "openai-codex": 3 },
		auth: {
			"openai-codex": personalCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		},
		builtinProviders: ["openai-codex"],
	});
	assert.equal(lookup.kind, "slot");
	assert.equal(lookup.storageKey, "openai-codex#2");
	assert.deepEqual(lookup.credential, workCred);
	assert.equal(
		publicSubscriptionHasAuth({
			providerName: "codex-work",
			subscriptions: [work, personal],
			activeSlots: { "openai-codex": 3 },
			auth: {
				"openai-codex": personalCred,
				"openai-codex#2": workCred,
			},
			builtinProviders: ["openai-codex"],
		}),
		true,
	);
});

test("openai-codex is a built-in target and maps to the active public slot name", () => {
	assert.deepEqual(
		resolvePublicSubscriptionTarget({
			providerName: "openai-codex",
			subscriptions: [work, personal],
			builtinProviders: ["openai-codex"],
		}),
		{ kind: "builtin", provider: "openai-codex" },
	);
	assert.deepEqual(
		resolvePublicSubscriptionTarget({
			providerName: "codex-personal",
			subscriptions: [work, personal],
			builtinProviders: ["openai-codex"],
		}),
		{ kind: "slot", entry: personal },
	);
	assert.equal(
		publicNameForActiveSlot({
			provider: "openai-codex",
			subscriptions: [work, personal],
			activeSlots: { "openai-codex": 2 },
		}),
		"codex-work",
	);
});
