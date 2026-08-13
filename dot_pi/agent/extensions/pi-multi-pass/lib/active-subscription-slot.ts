/**
 * Active subscription slot identity and transition plans.
 *
 * Extra multipass logins stay on private auth keys. One slot per base
 * provider is active. The built-in provider name, such as openai-codex,
 * holds a live copy of that slot so children inherit the same login.
 */

export type SubscriptionSlotEntry = {
	readonly provider: string;
	readonly index: number;
	readonly label?: string;
};

export type StoredSubscriptionCredential = {
	readonly type: string;
	readonly [key: string]: unknown;
};

export type SubscriptionSlotAuthSnapshot = Readonly<
	Record<string, StoredSubscriptionCredential>
>;

/** Map of built-in provider name to the active extra-subscription index. */
export type ActiveSubscriptionSlots = Readonly<Record<string, number>>;

export type SubscriptionSlotResult<T, E> =
	| { readonly _tag: "ok"; readonly value: T }
	| { readonly _tag: "err"; readonly error: E };

export type SubscriptionSlotAuthWrite = {
	readonly key: string;
	readonly credential: StoredSubscriptionCredential;
};

export type SubscriptionSlotAuthDelete = {
	readonly key: string;
};

export type ActivateSubscriptionSlotError =
	| {
			readonly _tag: "SubscriptionSlotNotFound";
			readonly provider: string;
			readonly index: number;
	  }
	| {
			readonly _tag: "SubscriptionSlotMissingAuth";
			readonly storageKey: string;
			readonly provider: string;
			readonly index: number;
	  };

/** Index used to park the original built-in login when an extra slot becomes active. */
export const ORIGINAL_SUBSCRIPTION_SLOT_INDEX = 1;

export type ActivateSubscriptionSlotPlan = {
	readonly writes: readonly SubscriptionSlotAuthWrite[];
	readonly deletes: readonly SubscriptionSlotAuthDelete[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly target: SubscriptionSlotEntry;
};

export type LogoutSubscriptionSlotPlan = {
	readonly writes: readonly SubscriptionSlotAuthWrite[];
	readonly deletes: readonly SubscriptionSlotAuthDelete[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly nextActive: SubscriptionSlotEntry | undefined;
};

export type RestoreOriginalSubscriptionSlotError =
	| {
			readonly _tag: "OriginalSubscriptionSlotMissingAuth";
			readonly storageKey: string;
			readonly provider: string;
	  };

export type RestoreOriginalSubscriptionSlotPlan = {
	readonly writes: readonly SubscriptionSlotAuthWrite[];
	readonly deletes: readonly SubscriptionSlotAuthDelete[];
	readonly activeSlots: ActiveSubscriptionSlots;
};

/**
 * Private auth.json key for one extra subscription slot.
 * Example: openai-codex#2. This is not a public model provider name.
 */
export function subscriptionSlotStorageKey(entry: {
	provider: string;
	index: number;
}): string {
	return `${entry.provider}#${entry.index}`;
}

/**
 * Public switch/list name for a slot. Prefer a sanitized label.
 */
export function subscriptionSlotPublicName(
	entry: SubscriptionSlotEntry,
	allEntries: readonly SubscriptionSlotEntry[],
): string {
	const sanitized = entry.label ? sanitizeSubscriptionSlotLabel(entry.label) : "";
	if (!sanitized) return `${entry.provider}-${entry.index}`;
	const collision = allEntries.some((candidate) => {
		if (candidate.provider === entry.provider && candidate.index === entry.index) {
			return false;
		}
		return candidate.label
			? sanitizeSubscriptionSlotLabel(candidate.label) === sanitized
			: false;
	});
	return collision ? `${entry.provider}-${entry.index}` : sanitized;
}

/**
 * Normalize a user label into a public slot name.
 */
export function sanitizeSubscriptionSlotLabel(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Auth.json keys that older multipass builds used as clone providers.
 */
export function legacyCloneProviderAuthKeys(
	entry: SubscriptionSlotEntry,
	allEntries: readonly SubscriptionSlotEntry[],
): string[] {
	const keys = [`${entry.provider}-${entry.index}`];
	const publicName = subscriptionSlotPublicName(entry, allEntries);
	if (publicName !== keys[0] && publicName !== entry.provider) {
		keys.unshift(publicName);
	}
	return keys;
}

/**
 * Parse the persisted active-slot map from multi-pass.json.
 */
export function parseActiveSubscriptionSlots(raw: unknown): ActiveSubscriptionSlots {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const activeSlots: Record<string, number> = {};
	for (const [provider, indexValue] of Object.entries(raw)) {
		if (!provider.trim()) continue;
		const index =
			typeof indexValue === "number"
				? indexValue
				: typeof indexValue === "string"
					? Number.parseInt(indexValue, 10)
					: Number.NaN;
		if (!Number.isInteger(index) || index < 1) continue;
		activeSlots[provider] = index;
	}
	return activeSlots;
}

/**
 * Find a configured extra subscription by public name or storage identity.
 */
export function findSubscriptionSlot(
	subscriptions: readonly SubscriptionSlotEntry[],
	request: { provider?: string; index?: number; publicName?: string },
): SubscriptionSlotEntry | undefined {
	if (request.provider && typeof request.index === "number") {
		return subscriptions.find(
			(entry) => entry.provider === request.provider && entry.index === request.index,
		);
	}
	if (request.publicName) {
		return subscriptions.find(
			(entry) => subscriptionSlotPublicName(entry, subscriptions) === request.publicName,
		);
	}
	return undefined;
}

/**
 * True when the slot has its own stored login, or is active and the live
 * built-in provider still has tokens.
 */
export function subscriptionSlotHasAuth(
	entry: SubscriptionSlotEntry,
	auth: SubscriptionSlotAuthSnapshot,
	activeSlots: ActiveSubscriptionSlots = {},
): boolean {
	if (auth[subscriptionSlotStorageKey(entry)]) return true;
	if (activeSlots[entry.provider] === entry.index && auth[entry.provider]) return true;
	return false;
}

/**
 * Return the extra slot that should currently back a built-in provider.
 */
export function resolveActiveSubscriptionSlot(
	provider: string,
	activeSlots: ActiveSubscriptionSlots,
	subscriptions: readonly SubscriptionSlotEntry[],
	auth: SubscriptionSlotAuthSnapshot,
): SubscriptionSlotEntry | undefined {
	const configuredIndex = activeSlots[provider];
	if (typeof configuredIndex === "number") {
		const configured = subscriptions.find(
			(entry) => entry.provider === provider && entry.index === configuredIndex,
		);
		if (configured && subscriptionSlotHasAuth(configured, auth, activeSlots)) {
			return configured;
		}
	}
	return subscriptions.find(
		(entry) => entry.provider === provider && subscriptionSlotHasAuth(entry, auth, activeSlots),
	);
}

/**
 * Plan copying one extra slot onto the built-in provider name.
 * Writes the live tokens back to the previous slot first so a refresh is kept.
 */
export function planActivateSubscriptionSlot(input: {
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
	readonly provider: string;
	readonly index: number;
}): SubscriptionSlotResult<ActivateSubscriptionSlotPlan, ActivateSubscriptionSlotError> {
	const target = input.subscriptions.find(
		(entry) => entry.provider === input.provider && entry.index === input.index,
	);
	if (!target) {
		return {
			_tag: "err",
			error: {
				_tag: "SubscriptionSlotNotFound",
				provider: input.provider,
				index: input.index,
			},
		};
	}

	const targetKey = subscriptionSlotStorageKey(target);
	const previousIndex = input.activeSlots[input.provider];
	const live = input.auth[input.provider];
	const previous =
		typeof previousIndex === "number"
			? input.subscriptions.find(
					(entry) => entry.provider === input.provider && entry.index === previousIndex,
				)
			: undefined;
	const targetCredential =
		input.auth[targetKey]
		?? (previous?.index === target.index ? live : undefined);
	if (!targetCredential) {
		return {
			_tag: "err",
			error: {
				_tag: "SubscriptionSlotMissingAuth",
				storageKey: targetKey,
				provider: target.provider,
				index: target.index,
			},
		};
	}

	const writes: SubscriptionSlotAuthWrite[] = [];
	if (live && previous && previous.index !== target.index) {
		writes.push({
			key: subscriptionSlotStorageKey(previous),
			credential: live,
		});
	} else if (live && !previous && target.index !== ORIGINAL_SUBSCRIPTION_SLOT_INDEX) {
		writes.push({
			key: subscriptionSlotStorageKey({
				provider: target.provider,
				index: ORIGINAL_SUBSCRIPTION_SLOT_INDEX,
			}),
			credential: live,
		});
	}
	const freshest = live && previous?.index === target.index ? live : targetCredential;
	writes.push({ key: targetKey, credential: freshest });
	writes.push({ key: target.provider, credential: freshest });

	return {
		_tag: "ok",
		value: {
			writes: dedupeAuthWrites(writes),
			deletes: [],
			activeSlots: {
				...input.activeSlots,
				[target.provider]: target.index,
			},
			target,
		},
	};
}

/**
 * Plan startup so a built-in provider has one logged-in extra slot active.
 */
export function planEnsureActiveSubscriptionSlot(input: {
	readonly provider: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
}): SubscriptionSlotResult<ActivateSubscriptionSlotPlan, ActivateSubscriptionSlotError> | undefined {
	const originalKey = subscriptionSlotStorageKey({
		provider: input.provider,
		index: ORIGINAL_SUBSCRIPTION_SLOT_INDEX,
	});
	if (
		input.activeSlots[input.provider] == null
		&& input.auth[input.provider]
		&& input.auth[originalKey]
	) {
		return undefined;
	}
	const target = resolveActiveSubscriptionSlot(
		input.provider,
		input.activeSlots,
		input.subscriptions,
		input.auth,
	);
	if (!target) return undefined;
	return planActivateSubscriptionSlot({
		subscriptions: input.subscriptions,
		activeSlots: input.activeSlots,
		auth: input.auth,
		provider: target.provider,
		index: target.index,
	});
}

/**
 * Plan logout of one extra slot. If it was active, the next logged-in slot
 * becomes active, or the live built-in key is cleared.
 */
export function planLogoutSubscriptionSlot(input: {
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
	readonly provider: string;
	readonly index: number;
}): SubscriptionSlotResult<LogoutSubscriptionSlotPlan, ActivateSubscriptionSlotError> {
	const target = input.subscriptions.find(
		(entry) => entry.provider === input.provider && entry.index === input.index,
	);
	if (!target) {
		return {
			_tag: "err",
			error: {
				_tag: "SubscriptionSlotNotFound",
				provider: input.provider,
				index: input.index,
			},
		};
	}

	const remainingAuth: Record<string, StoredSubscriptionCredential> = { ...input.auth };
	delete remainingAuth[subscriptionSlotStorageKey(target)];
	const wasActive = input.activeSlots[target.provider] === target.index;
	if (wasActive) {
		delete remainingAuth[target.provider];
	}

	const remainingActive = { ...input.activeSlots };
	if (wasActive) {
		delete remainingActive[target.provider];
	}

	const nextActive = wasActive
		? resolveActiveSubscriptionSlot(
				target.provider,
				remainingActive,
				input.subscriptions.filter(
					(entry) => !(entry.provider === target.provider && entry.index === target.index),
				),
				remainingAuth,
			)
		: undefined;

	if (nextActive) {
		const activate = planActivateSubscriptionSlot({
			subscriptions: input.subscriptions,
			activeSlots: remainingActive,
			auth: remainingAuth,
			provider: nextActive.provider,
			index: nextActive.index,
		});
		if (activate._tag === "err") return activate;
		return {
			_tag: "ok",
			value: {
				writes: activate.value.writes,
				deletes: [
					{ key: subscriptionSlotStorageKey(target) },
					...activate.value.deletes,
				],
				activeSlots: activate.value.activeSlots,
				nextActive: activate.value.target,
			},
		};
	}

	const originalKey = subscriptionSlotStorageKey({
		provider: target.provider,
		index: ORIGINAL_SUBSCRIPTION_SLOT_INDEX,
	});
	const originalCredential = remainingAuth[originalKey];
	if (wasActive && originalCredential) {
		return {
			_tag: "ok",
			value: {
				writes: [{ key: target.provider, credential: originalCredential }],
				deletes: [{ key: subscriptionSlotStorageKey(target) }],
				activeSlots: remainingActive,
				nextActive: undefined,
			},
		};
	}

	const deletes: SubscriptionSlotAuthDelete[] = [
		{ key: subscriptionSlotStorageKey(target) },
	];
	if (wasActive) {
		deletes.push({ key: target.provider });
	}

	return {
		_tag: "ok",
		value: {
			writes: [],
			deletes,
			activeSlots: remainingActive,
			nextActive,
		},
	};
}

export type BootstrapActiveSubscriptionSlotsPlan = {
	readonly writes: readonly SubscriptionSlotAuthWrite[];
	readonly deletes: readonly SubscriptionSlotAuthDelete[];
	readonly activeSlots: ActiveSubscriptionSlots;
};

/**
 * Plan restoring the parked original built-in login and clearing the extra
 * active-slot pointer. Live extra tokens are written back first.
 */
export function planRestoreOriginalSubscriptionSlot(input: {
	readonly provider: string;
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
}): SubscriptionSlotResult<
	RestoreOriginalSubscriptionSlotPlan,
	RestoreOriginalSubscriptionSlotError
> {
	const originalKey = subscriptionSlotStorageKey({
		provider: input.provider,
		index: ORIGINAL_SUBSCRIPTION_SLOT_INDEX,
	});
	const originalCredential = input.auth[originalKey];
	if (!originalCredential) {
		return {
			_tag: "err",
			error: {
				_tag: "OriginalSubscriptionSlotMissingAuth",
				storageKey: originalKey,
				provider: input.provider,
			},
		};
	}

	const writes: SubscriptionSlotAuthWrite[] = [];
	const previousIndex = input.activeSlots[input.provider];
	const live = input.auth[input.provider];
	const previous =
		typeof previousIndex === "number"
			? input.subscriptions.find(
					(entry) => entry.provider === input.provider && entry.index === previousIndex,
				)
			: undefined;
	if (live && previous) {
		writes.push({
			key: subscriptionSlotStorageKey(previous),
			credential: live,
		});
	}
	writes.push({
		key: originalKey,
		credential: originalCredential,
	});
	writes.push({
		key: input.provider,
		credential: originalCredential,
	});

	const remainingActive = { ...input.activeSlots };
	delete remainingActive[input.provider];

	return {
		_tag: "ok",
		value: {
			writes: dedupeAuthWrites(writes),
			deletes: [],
			activeSlots: remainingActive,
		},
	};
}

/**
 * Plan first-load migration plus one active extra slot per built-in provider.
 * Parks the original built-in login as slot #1 when an extra slot takes over.
 */
export function planBootstrapActiveSubscriptionSlots(input: {
	readonly providers: readonly string[];
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly activeSlots: ActiveSubscriptionSlots;
	readonly auth: SubscriptionSlotAuthSnapshot;
}): BootstrapActiveSubscriptionSlotsPlan {
	const migrate = planMigrateLegacyCloneProviderAuth({
		subscriptions: input.subscriptions,
		auth: input.auth,
	});
	const auth: Record<string, StoredSubscriptionCredential> = { ...input.auth };
	applyAuthPlanInMemory(auth, migrate);

	const writes: SubscriptionSlotAuthWrite[] = [...migrate.writes];
	const deletes: SubscriptionSlotAuthDelete[] = [...migrate.deletes];
	let activeSlots = input.activeSlots;

	for (const provider of input.providers) {
		const ensure = planEnsureActiveSubscriptionSlot({
			provider,
			subscriptions: input.subscriptions,
			activeSlots,
			auth,
		});
		if (!ensure || ensure._tag === "err") continue;
		writes.push(...ensure.value.writes);
		deletes.push(...ensure.value.deletes);
		activeSlots = ensure.value.activeSlots;
		applyAuthPlanInMemory(auth, ensure.value);
	}

	return {
		writes: dedupeAuthWrites(writes),
		deletes: deletes.filter((remove) => !writes.some((write) => write.key === remove.key)),
		activeSlots,
	};
}

function applyAuthPlanInMemory(
	auth: Record<string, StoredSubscriptionCredential>,
	plan: {
		readonly writes?: readonly SubscriptionSlotAuthWrite[];
		readonly deletes?: readonly SubscriptionSlotAuthDelete[];
	},
): void {
	const written = new Set<string>();
	for (const write of plan.writes ?? []) {
		auth[write.key] = write.credential;
		written.add(write.key);
	}
	for (const remove of plan.deletes ?? []) {
		if (written.has(remove.key)) continue;
		delete auth[remove.key];
	}
}

/**
 * Plan moving old clone-provider auth keys onto private slot keys.
 */
export function planMigrateLegacyCloneProviderAuth(input: {
	readonly subscriptions: readonly SubscriptionSlotEntry[];
	readonly auth: SubscriptionSlotAuthSnapshot;
}): {
	readonly writes: readonly SubscriptionSlotAuthWrite[];
	readonly deletes: readonly SubscriptionSlotAuthDelete[];
} {
	const writes: SubscriptionSlotAuthWrite[] = [];
	const deletes: SubscriptionSlotAuthDelete[] = [];

	for (const entry of input.subscriptions) {
		const storageKey = subscriptionSlotStorageKey(entry);
		if (input.auth[storageKey]) continue;
		const legacyKey = legacyCloneProviderAuthKeys(entry, input.subscriptions).find(
			(key) => key !== entry.provider && input.auth[key],
		);
		if (!legacyKey) continue;
		const credential = input.auth[legacyKey];
		if (!credential) continue;
		writes.push({ key: storageKey, credential });
		deletes.push({ key: legacyKey });
	}

	return { writes, deletes };
}

/**
 * Rewrite enabled model refs from clone providers onto the built-in provider.
 */
export function rewriteEnabledModelsToBaseProviders(
	enabledModels: readonly string[],
	subscriptions: readonly SubscriptionSlotEntry[],
): string[] {
	const cloneToBase = new Map<string, string>();
	for (const entry of subscriptions) {
		cloneToBase.set(`${entry.provider}-${entry.index}`, entry.provider);
		cloneToBase.set(subscriptionSlotPublicName(entry, subscriptions), entry.provider);
	}

	const rewritten: string[] = [];
	const seen = new Set<string>();
	for (const value of enabledModels) {
		const slash = value.indexOf("/");
		if (slash <= 0) {
			if (!seen.has(value)) {
				seen.add(value);
				rewritten.push(value);
			}
			continue;
		}
		const provider = value.slice(0, slash);
		const modelId = value.slice(slash + 1);
		const baseProvider = cloneToBase.get(provider) ?? provider;
		const next = `${baseProvider}/${modelId}`;
		if (seen.has(next)) continue;
		seen.add(next);
		rewritten.push(next);
	}
	return rewritten;
}

function dedupeAuthWrites(
	writes: readonly SubscriptionSlotAuthWrite[],
): SubscriptionSlotAuthWrite[] {
	const byKey = new Map<string, StoredSubscriptionCredential>();
	for (const write of writes) {
		byKey.set(write.key, write.credential);
	}
	return [...byKey.entries()].map(([key, credential]) => ({ key, credential }));
}
