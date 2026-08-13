/**
 * Resolve public subscription names onto stored slot credentials.
 *
 * "codex-work" reads openai-codex#2, or the live openai-codex copy when
 * that slot is active. "openai-codex" always reads the live built-in key.
 */

import {
	findSubscriptionSlot,
	subscriptionSlotHasAuth,
	subscriptionSlotPublicName,
	subscriptionSlotStorageKey,
	type ActiveSubscriptionSlots,
	type StoredSubscriptionCredential,
	type SubscriptionSlotAuthSnapshot,
	type SubscriptionSlotEntry,
} from "./active-subscription-slot.ts";

export type SubscriptionAuthLookup = {
	readonly kind: "live" | "slot";
	readonly storageKey: string;
	readonly entry?: SubscriptionSlotEntry;
	readonly credential: StoredSubscriptionCredential | undefined;
};

export type PublicSubscriptionTarget =
	| { readonly kind: "builtin"; readonly provider: string }
	| { readonly kind: "slot"; readonly entry: SubscriptionSlotEntry };

/**
 * Resolve a public /subs name to either a built-in provider or an extra slot.
 */
export function resolvePublicSubscriptionTarget(input: {
	readonly providerName: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly builtinProviders?: readonly string[] | undefined;
}): PublicSubscriptionTarget | undefined {
	if (input.builtinProviders?.includes(input.providerName)) {
		return { kind: "builtin", provider: input.providerName };
	}
	const entry = findSubscriptionSlotByName(input.subscriptions, input.providerName);
	return entry ? { kind: "slot", entry } : undefined;
}

/**
 * Find an extra slot by its public name or its provider-index form.
 */
export function findSubscriptionSlotByName(
	subscriptions: readonly SubscriptionSlotEntry[],
	providerName: string,
): SubscriptionSlotEntry | undefined {
	const indexed = parseIndexedName(providerName);
	return findSubscriptionSlot(subscriptions, { publicName: providerName })
		?? (indexed ? findSubscriptionSlot(subscriptions, indexed) : undefined);
}

/**
 * Public switch name for the extra slot that currently backs a built-in provider.
 */
export function publicNameForActiveSlot(input: {
	readonly provider: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
}): string {
	const activeIndex = input.activeSlots[input.provider];
	if (typeof activeIndex !== "number") return input.provider;
	const entry = input.subscriptions.find(
		(candidate) => candidate.provider === input.provider && candidate.index === activeIndex,
	);
	return entry
		? subscriptionSlotPublicName(entry, input.subscriptions)
		: input.provider;
}

/**
 * Map a public provider or slot name to the credential that should back it.
 */
export function lookupSubscriptionAuth(input: {
	readonly providerName: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
	readonly builtinProviders?: readonly string[];
}): SubscriptionAuthLookup {
	const entry = input.builtinProviders?.includes(input.providerName)
		? undefined
		: findSubscriptionSlotByName(input.subscriptions, input.providerName);

	if (!entry) {
		return {
			kind: "live",
			storageKey: input.providerName,
			credential: input.auth[input.providerName],
		};
	}

	const storageKey = subscriptionSlotStorageKey(entry);
	const credential = input.auth[storageKey]
		?? (input.activeSlots[entry.provider] === entry.index
			? input.auth[entry.provider]
			: undefined);
	return {
		kind: "slot",
		storageKey,
		entry,
		credential,
	};
}

/**
 * True when a public provider or slot name currently has usable tokens.
 */
export function publicSubscriptionHasAuth(input: {
	readonly providerName: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
	readonly builtinProviders?: readonly string[];
}): boolean {
	const lookup = lookupSubscriptionAuth(input);
	if (lookup.kind === "slot" && lookup.entry) {
		return subscriptionSlotHasAuth(lookup.entry, input.auth, input.activeSlots);
	}
	return lookup.credential != null;
}

function parseIndexedName(
	providerName: string,
): { provider: string; index: number } | undefined {
	const match = providerName.match(/^(.*)-(\d+)$/);
	if (!match?.[1] || !match[2]) return undefined;
	return {
		provider: match[1],
		index: Number.parseInt(match[2], 10),
	};
}
