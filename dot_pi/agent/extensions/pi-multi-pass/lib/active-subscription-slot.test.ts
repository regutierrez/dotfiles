import assert from "node:assert/strict";
import test from "node:test";
import {
	findSubscriptionSlot,
	legacyCloneProviderAuthKeys,
	parseActiveSubscriptionSlots,
	planActivateSubscriptionSlot,
	planBootstrapActiveSubscriptionSlots,
	planEnsureActiveSubscriptionSlot,
	planLogoutSubscriptionSlot,
	planMigrateLegacyCloneProviderAuth,
	planRestoreOriginalSubscriptionSlot,
	rewriteEnabledModelsToBaseProviders,
	subscriptionSlotHasAuth,
	subscriptionSlotPublicName,
	subscriptionSlotStorageKey,
} from "./active-subscription-slot.ts";

const work = { provider: "openai-codex", index: 2, label: "codex-work" };
const personal = { provider: "openai-codex", index: 3, label: "codex-personal" };
const subscriptions = [work, personal];

const originalCred = {
	type: "oauth",
	access: "original-access",
	refresh: "original-refresh",
	expires: 50,
	accountId: "original-account",
};
const workCred = {
	type: "oauth",
	access: "work-access",
	refresh: "work-refresh",
	expires: 100,
	accountId: "work-account",
};
const personalCred = {
	type: "oauth",
	access: "personal-access",
	refresh: "personal-refresh",
	expires: 200,
	accountId: "personal-account",
};
const refreshedWorkCred = {
	type: "oauth",
	access: "work-access-refreshed",
	refresh: "work-refresh-refreshed",
	expires: 300,
	accountId: "work-account",
};

test("builds private storage keys that are not public provider names", () => {
	assert.equal(subscriptionSlotStorageKey(work), "openai-codex#2");
});

test("prefers a sanitized label as the public slot name", () => {
	assert.equal(subscriptionSlotPublicName(work, subscriptions), "codex-work");
	assert.equal(
		subscriptionSlotPublicName({ provider: "openai-codex", index: 4 }, subscriptions),
		"openai-codex-4",
	);
	assert.equal(
		subscriptionSlotPublicName(
			{ provider: "openai-codex", index: 5, label: "codex-work" },
			[work, { provider: "openai-codex", index: 5, label: "codex-work" }],
		),
		"openai-codex-5",
	);
});

test("finds a slot by public name or by provider index", () => {
	assert.deepEqual(
		findSubscriptionSlot(subscriptions, { publicName: "codex-personal" }),
		personal,
	);
	assert.deepEqual(
		findSubscriptionSlot(subscriptions, { provider: "openai-codex", index: 2 }),
		work,
	);
	assert.equal(findSubscriptionSlot(subscriptions, { publicName: "missing" }), undefined);
});

test("treats live built-in tokens as auth only for the active slot", () => {
	const auth = { "openai-codex": workCred };
	assert.equal(subscriptionSlotHasAuth(work, auth, { "openai-codex": 2 }), true);
	assert.equal(subscriptionSlotHasAuth(personal, auth, { "openai-codex": 2 }), false);
	assert.equal(
		subscriptionSlotHasAuth(personal, { "openai-codex#3": personalCred }, { "openai-codex": 2 }),
		true,
	);
});

test("parses the persisted active slot map and ignores invalid indexes", () => {
	assert.deepEqual(
		parseActiveSubscriptionSlots({ "openai-codex": 3, anthropic: "2", broken: 0 }),
		{ "openai-codex": 3, anthropic: 2 },
	);
	assert.deepEqual(parseActiveSubscriptionSlots(["openai-codex"]), {});
});

test("activating another slot writes live tokens back to the previous slot first", () => {
	const plan = planActivateSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": refreshedWorkCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		},
		provider: "openai-codex",
		index: 3,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.deepEqual(plan.value.activeSlots, { "openai-codex": 3 });
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#2", credential: refreshedWorkCred },
		{ key: "openai-codex#3", credential: personalCred },
		{ key: "openai-codex", credential: personalCred },
	]);
});

test("activating the current slot copies refreshed live tokens back onto the slot", () => {
	const plan = planActivateSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": refreshedWorkCred,
			"openai-codex#2": workCred,
		},
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#2", credential: refreshedWorkCred },
		{ key: "openai-codex", credential: refreshedWorkCred },
	]);
});

test("activating the first extra slot parks the original built-in login as slot #1", () => {
	const plan = planActivateSubscriptionSlot({
		subscriptions,
		activeSlots: {},
		auth: {
			"openai-codex": originalCred,
			"openai-codex#2": workCred,
		},
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#1", credential: originalCred },
		{ key: "openai-codex#2", credential: workCred },
		{ key: "openai-codex", credential: workCred },
	]);
});

test("activating a slot with only live tokens still copies them onto the private key", () => {
	const plan = planActivateSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: { "openai-codex": refreshedWorkCred },
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#2", credential: refreshedWorkCred },
		{ key: "openai-codex", credential: refreshedWorkCred },
	]);
});

test("refuses to activate a slot that has no stored login", () => {
	const plan = planActivateSubscriptionSlot({
		subscriptions,
		activeSlots: {},
		auth: { "openai-codex#2": workCred },
		provider: "openai-codex",
		index: 3,
	});

	assert.deepEqual(plan, {
		_tag: "err",
		error: {
			_tag: "SubscriptionSlotMissingAuth",
			storageKey: "openai-codex#3",
			provider: "openai-codex",
			index: 3,
		},
	});
});

test("startup uses the configured active slot when that slot is logged in", () => {
	const plan = planEnsureActiveSubscriptionSlot({
		provider: "openai-codex",
		subscriptions,
		activeSlots: { "openai-codex": 3 },
		auth: {
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		},
	});

	assert.equal(plan?._tag, "ok");
	if (plan?._tag !== "ok") return;
	assert.equal(plan.value.target.index, 3);
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#3", credential: personalCred },
		{ key: "openai-codex", credential: personalCred },
	]);
});

test("startup falls back to the first logged-in slot when the configured slot is empty", () => {
	const plan = planEnsureActiveSubscriptionSlot({
		provider: "openai-codex",
		subscriptions,
		activeSlots: { "openai-codex": 3 },
		auth: { "openai-codex#2": workCred },
	});

	assert.equal(plan?._tag, "ok");
	if (plan?._tag !== "ok") return;
	assert.equal(plan.value.target.index, 2);
});

test("startup keeps the restored original login active when no slot is configured", () => {
	assert.equal(
		planEnsureActiveSubscriptionSlot({
			provider: "openai-codex",
			subscriptions,
			activeSlots: {},
			auth: {
				"openai-codex": originalCred,
				"openai-codex#1": originalCred,
				"openai-codex#2": workCred,
			},
		}),
		undefined,
	);
});

test("startup does nothing when no extra slot is logged in", () => {
	assert.equal(
		planEnsureActiveSubscriptionSlot({
			provider: "openai-codex",
			subscriptions,
			activeSlots: {},
			auth: {},
		}),
		undefined,
	);
});

test("logging out the active slot promotes the next logged-in slot", () => {
	const plan = planLogoutSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": workCred,
			"openai-codex#2": workCred,
			"openai-codex#3": personalCred,
		},
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.equal(plan.value.nextActive?.index, 3);
	assert.deepEqual(plan.value.deletes, [{ key: "openai-codex#2" }]);
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#3", credential: personalCred },
		{ key: "openai-codex", credential: personalCred },
	]);
	assert.deepEqual(plan.value.activeSlots, { "openai-codex": 3 });
});

test("restoring the original login writes extra tokens back then copies slot #1 onto openai-codex", () => {
	const plan = planRestoreOriginalSubscriptionSlot({
		provider: "openai-codex",
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": refreshedWorkCred,
			"openai-codex#1": originalCred,
			"openai-codex#2": workCred,
		},
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.deepEqual(plan.value.activeSlots, {});
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex#2", credential: refreshedWorkCred },
		{ key: "openai-codex#1", credential: originalCred },
		{ key: "openai-codex", credential: originalCred },
	]);
});

test("restore fails when the parked original login is missing", () => {
	assert.deepEqual(
		planRestoreOriginalSubscriptionSlot({
			provider: "openai-codex",
			subscriptions,
			activeSlots: { "openai-codex": 2 },
			auth: {
				"openai-codex": workCred,
				"openai-codex#2": workCred,
			},
		}),
		{
			_tag: "err",
			error: {
				_tag: "OriginalSubscriptionSlotMissingAuth",
				storageKey: "openai-codex#1",
				provider: "openai-codex",
			},
		},
	);
});

test("logging out the last extra slot restores the parked original login", () => {
	const plan = planLogoutSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": workCred,
			"openai-codex#1": originalCred,
			"openai-codex#2": workCred,
		},
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.equal(plan.value.nextActive, undefined);
	assert.deepEqual(plan.value.writes, [
		{ key: "openai-codex", credential: originalCred },
	]);
	assert.deepEqual(plan.value.deletes, [{ key: "openai-codex#2" }]);
});

test("logging out the last slot clears the live built-in provider", () => {
	const plan = planLogoutSubscriptionSlot({
		subscriptions,
		activeSlots: { "openai-codex": 2 },
		auth: {
			"openai-codex": workCred,
			"openai-codex#2": workCred,
		},
		provider: "openai-codex",
		index: 2,
	});

	assert.equal(plan._tag, "ok");
	if (plan._tag !== "ok") return;
	assert.equal(plan.value.nextActive, undefined);
	assert.deepEqual(plan.value.writes, []);
	assert.deepEqual(plan.value.deletes, [
		{ key: "openai-codex#2" },
		{ key: "openai-codex" },
	]);
	assert.deepEqual(plan.value.activeSlots, {});
});

test("migrates old clone-provider auth keys onto private slot keys", () => {
	assert.deepEqual(legacyCloneProviderAuthKeys(work, subscriptions), [
		"codex-work",
		"openai-codex-2",
	]);

	const plan = planMigrateLegacyCloneProviderAuth({
		subscriptions,
		auth: {
			"codex-work": workCred,
			"codex-personal": personalCred,
		},
	});

	assert.deepEqual(plan.writes, [
		{ key: "openai-codex#2", credential: workCred },
		{ key: "openai-codex#3", credential: personalCred },
	]);
	assert.deepEqual(plan.deletes, [
		{ key: "codex-work" },
		{ key: "codex-personal" },
	]);
});

test("bootstrap migrates clone keys and activates the configured extra slot", () => {
	const plan = planBootstrapActiveSubscriptionSlots({
		providers: ["openai-codex"],
		subscriptions,
		activeSlots: { "openai-codex": 3 },
		auth: {
			"codex-work": workCred,
			"codex-personal": personalCred,
		},
	});

	assert.deepEqual(plan.activeSlots, { "openai-codex": 3 });
	assert.deepEqual(plan.writes, [
		{ key: "openai-codex#2", credential: workCred },
		{ key: "openai-codex#3", credential: personalCred },
		{ key: "openai-codex", credential: personalCred },
	]);
	assert.deepEqual(plan.deletes, [
		{ key: "codex-work" },
		{ key: "codex-personal" },
	]);
});

test("rewrites enabled clone-provider models onto the built-in provider", () => {
	assert.deepEqual(
		rewriteEnabledModelsToBaseProviders(
			[
				"xai/grok-4.6",
				"codex-work/gpt-5.6-sol",
				"codex-personal/gpt-5.6-sol",
				"codex-work/gpt-5.6-luna",
				"openai-codex/gpt-5.6-sol",
			],
			subscriptions,
		),
		[
			"xai/grok-4.6",
			"openai-codex/gpt-5.6-sol",
			"openai-codex/gpt-5.6-luna",
		],
	);
});
