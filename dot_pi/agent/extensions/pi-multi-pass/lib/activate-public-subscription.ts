/**
 * Activate the extra slot or parked original login behind a public /subs name.
 */

import {
	applyActivateSubscriptionSlot,
	applyRestoreOriginalSubscriptionSlot,
	type ApplySubscriptionSlotPlanFiles,
} from "./apply-subscription-slot-plan.ts";
import {
	resolvePublicSubscriptionTarget,
} from "./subscription-slot-auth-lookup.ts";
import type {
	ActiveSubscriptionSlots,
	SubscriptionSlotEntry,
} from "./active-subscription-slot.ts";

export type ActivatePublicSubscriptionResult =
	| {
			readonly _tag: "ok";
			readonly kind: "slot" | "original" | "unchanged";
			readonly provider: string;
			readonly activeSlots: ActiveSubscriptionSlots;
			readonly entry?: SubscriptionSlotEntry;
	  }
	| {
			readonly _tag: "err";
			readonly message: string;
	  };

/**
 * Copy the chosen extra slot onto the built-in provider, or restore the
 * parked original login when the public name is that built-in provider.
 */
export function activatePublicSubscription(input: {
	readonly files: ApplySubscriptionSlotPlanFiles;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly providerName: string;
	readonly builtinProviders?: readonly string[];
}): ActivatePublicSubscriptionResult {
	const target = resolvePublicSubscriptionTarget({
		providerName: input.providerName,
		subscriptions: input.subscriptions,
		builtinProviders: input.builtinProviders,
	});
	if (!target) {
		return {
			_tag: "err",
			message: `Unknown subscription: ${input.providerName}`,
		};
	}

	if (target.kind === "builtin") {
		if (input.activeSlots[target.provider] == null) {
			return {
				_tag: "ok",
				kind: "unchanged",
				provider: target.provider,
				activeSlots: input.activeSlots,
			};
		}
		const restored = applyRestoreOriginalSubscriptionSlot({
			files: input.files,
			subscriptions: input.subscriptions,
			activeSlots: input.activeSlots,
			provider: target.provider,
		});
		if (restored._tag === "err") {
			return {
				_tag: "err",
				message: `Could not restore the original ${target.provider} login.`,
			};
		}
		return {
			_tag: "ok",
			kind: "original",
			provider: target.provider,
			activeSlots: restored.value.activeSlots,
		};
	}

	if (input.activeSlots[target.entry.provider] === target.entry.index) {
		return {
			_tag: "ok",
			kind: "unchanged",
			provider: target.entry.provider,
			activeSlots: input.activeSlots,
			entry: target.entry,
		};
	}

	const activated = applyActivateSubscriptionSlot({
		files: input.files,
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		provider: target.entry.provider,
		index: target.entry.index,
	});
	if (activated._tag === "err") {
		return {
			_tag: "err",
			message: `Could not activate ${input.providerName}.`,
		};
	}
	return {
		_tag: "ok",
		kind: "slot",
		provider: target.entry.provider,
		activeSlots: activated.value.activeSlots,
		entry: activated.value.target,
	};
}
