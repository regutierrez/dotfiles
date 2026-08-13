/**
 * Apply subscription-slot plans to auth.json and the persisted active-slot map.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	planActivateSubscriptionSlot,
	planLogoutSubscriptionSlot,
	planRestoreOriginalSubscriptionSlot,
	type ActivateSubscriptionSlotError,
	type ActivateSubscriptionSlotPlan,
	type ActiveSubscriptionSlots,
	type LogoutSubscriptionSlotPlan,
	type RestoreOriginalSubscriptionSlotError,
	type RestoreOriginalSubscriptionSlotPlan,
	subscriptionSlotStorageKey,
	type StoredSubscriptionCredential,
	type SubscriptionSlotEntry,
	type SubscriptionSlotResult,
} from "./active-subscription-slot.ts";
import {
	applySubscriptionSlotAuthPlan,
	readSubscriptionSlotAuthSnapshot,
} from "./subscription-slot-auth-store.ts";

export type ApplySubscriptionSlotPlanFiles = {
	readonly authPath: string;
	readonly configPath: string;
};

/**
 * Copy one extra slot onto the built-in provider name and persist the
 * active-slot pointer.
 */
export function applyActivateSubscriptionSlot(input: {
	readonly files: ApplySubscriptionSlotPlanFiles;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly provider: string;
	readonly index: number;
}): SubscriptionSlotResult<ActivateSubscriptionSlotPlan, ActivateSubscriptionSlotError> {
	const plan = planActivateSubscriptionSlot({
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		auth: readSubscriptionSlotAuthSnapshot(input.files.authPath),
		provider: input.provider,
		index: input.index,
	});
	if (plan._tag === "err") return plan;
	applySubscriptionSlotAuthPlan(input.files.authPath, plan.value);
	writeActiveSlots(input.files.configPath, plan.value.activeSlots);
	return plan;
}

/**
 * Remove one extra slot login. Promotes another logged-in slot or restores
 * the parked original built-in login.
 */
export function applyLogoutSubscriptionSlot(input: {
	readonly files: ApplySubscriptionSlotPlanFiles;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly provider: string;
	readonly index: number;
}): SubscriptionSlotResult<LogoutSubscriptionSlotPlan, ActivateSubscriptionSlotError> {
	const plan = planLogoutSubscriptionSlot({
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		auth: readSubscriptionSlotAuthSnapshot(input.files.authPath),
		provider: input.provider,
		index: input.index,
	});
	if (plan._tag === "err") return plan;
	applySubscriptionSlotAuthPlan(input.files.authPath, plan.value);
	writeActiveSlots(input.files.configPath, plan.value.activeSlots);
	return plan;
}

/**
 * Store a fresh OAuth login on a private slot key, then activate that slot
 * when the provider has no active extra slot yet.
 */
export function applySubscriptionSlotLogin(input: {
	readonly files: ApplySubscriptionSlotPlanFiles;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly entry: SubscriptionSlotEntry;
	readonly credential: StoredSubscriptionCredential;
}): SubscriptionSlotResult<ActivateSubscriptionSlotPlan, ActivateSubscriptionSlotError> | {
	readonly _tag: "ok";
	readonly value: { readonly activeSlots: ActiveSubscriptionSlots; readonly activated: false };
} {
	const activeIndex = input.activeSlots[input.entry.provider];
	const writes = [{
		key: subscriptionSlotStorageKey(input.entry),
		credential: input.credential,
	}];
	if (activeIndex === input.entry.index) {
		writes.push({
			key: input.entry.provider,
			credential: input.credential,
		});
	}
	applySubscriptionSlotAuthPlan(input.files.authPath, { writes });
	if (activeIndex != null) {
		return {
			_tag: "ok",
			value: { activeSlots: input.activeSlots, activated: false },
		};
	}
	return applyActivateSubscriptionSlot({
		files: input.files,
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		provider: input.entry.provider,
		index: input.entry.index,
	});
}

/**
 * Restore the parked original built-in login and clear the extra active slot.
 */
export function applyRestoreOriginalSubscriptionSlot(input: {
	readonly files: ApplySubscriptionSlotPlanFiles;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly provider: string;
}): SubscriptionSlotResult<
	RestoreOriginalSubscriptionSlotPlan,
	RestoreOriginalSubscriptionSlotError
> {
	const plan = planRestoreOriginalSubscriptionSlot({
		provider: input.provider,
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		auth: readSubscriptionSlotAuthSnapshot(input.files.authPath),
	});
	if (plan._tag === "err") return plan;
	applySubscriptionSlotAuthPlan(input.files.authPath, plan.value);
	writeActiveSlots(input.files.configPath, plan.value.activeSlots);
	return plan;
}

/** Persist the active-slot map into multi-pass.json without touching other keys. */
export function writeActiveSlots(configPath: string, activeSlots: ActiveSubscriptionSlots): void {
	let data: Record<string, unknown> = {};
	if (existsSync(configPath)) {
		try {
			const raw = JSON.parse(readFileSync(configPath, "utf-8"));
			if (raw && typeof raw === "object" && !Array.isArray(raw)) {
				data = raw as Record<string, unknown>;
			}
		} catch {
			data = {};
		}
	}
	data.activeSlots = activeSlots;
	writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}
