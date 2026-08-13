/**
 * First-load migration that parks extra logins on private keys and copies
 * one active slot onto the built-in provider name.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	planBootstrapActiveSubscriptionSlots,
	rewriteEnabledModelsToBaseProviders,
	type ActiveSubscriptionSlots,
	type SubscriptionSlotEntry,
} from "./active-subscription-slot.ts";
import { writeActiveSlots } from "./apply-subscription-slot-plan.ts";
import {
	applySubscriptionSlotAuthPlan,
	readSubscriptionSlotAuthSnapshot,
} from "./subscription-slot-auth-store.ts";

export type BootstrapActiveSubscriptionSlotsInput = {
	readonly authPath: string;
	readonly configPath: string;
	readonly settingsPath: string;
	readonly providers: readonly string[];
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
};

export type BootstrapActiveSubscriptionSlotsResult = {
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly migratedAuth: boolean;
	readonly rewrittenEnabledModels: boolean;
};

/**
 * Migrate clone-provider auth, activate one extra slot per built-in
 * provider, and rewrite enabledModels onto those built-in names.
 */
export function bootstrapActiveSubscriptionSlots(
	input: BootstrapActiveSubscriptionSlotsInput,
): BootstrapActiveSubscriptionSlotsResult {
	const auth = readSubscriptionSlotAuthSnapshot(input.authPath);
	const plan = planBootstrapActiveSubscriptionSlots({
		providers: input.providers,
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		auth,
	});
	const migratedAuth = plan.writes.length > 0 || plan.deletes.length > 0;
	if (migratedAuth) {
		backupAuthFileOnce(input.authPath);
		applySubscriptionSlotAuthPlan(input.authPath, plan);
	}

	const rewrittenEnabledModels = rewriteEnabledModelsFile(
		input.settingsPath,
		input.subscriptions,
	);

	if (migratedAuth || slotsChanged(input.activeSlots, plan.activeSlots)) {
		writeActiveSlots(input.configPath, plan.activeSlots);
	}

	return {
		activeSlots: plan.activeSlots,
		migratedAuth,
		rewrittenEnabledModels,
	};
}

function backupAuthFileOnce(authPath: string): void {
	if (!existsSync(authPath)) return;
	const backupPath = `${authPath}.multipass-slot-bak`;
	if (existsSync(backupPath)) return;
	copyFileSync(authPath, backupPath);
}

function rewriteEnabledModelsFile(
	settingsPath: string,
	subscriptions: readonly SubscriptionSlotEntry[],
): boolean {
	if (!existsSync(settingsPath)) return false;
	let data: Record<string, unknown>;
	try {
		const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
		data = raw as Record<string, unknown>;
	} catch {
		return false;
	}
	if (!Array.isArray(data.enabledModels)) return false;
	const enabledModels = data.enabledModels.filter(
		(value): value is string => typeof value === "string",
	);
	const rewritten = rewriteEnabledModelsToBaseProviders(enabledModels, subscriptions);
	if (arraysEqual(enabledModels, rewritten)) return false;
	data.enabledModels = rewritten;
	writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
	return true;
}

function slotsChanged(
	before: ActiveSubscriptionSlots,
	after: ActiveSubscriptionSlots,
): boolean {
	const beforeKeys = Object.keys(before);
	const afterKeys = Object.keys(after);
	if (beforeKeys.length !== afterKeys.length) return true;
	return afterKeys.some((key) => before[key] !== after[key]);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}
