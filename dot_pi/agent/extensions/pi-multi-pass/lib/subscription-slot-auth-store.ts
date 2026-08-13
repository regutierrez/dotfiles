/**
 * Read and apply subscription-slot auth.json plans.
 *
 * Extra slot tokens stay on private keys. The built-in provider key holds
 * the live copy of the active slot so openai-codex children inherit it.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
	StoredSubscriptionCredential,
	SubscriptionSlotAuthDelete,
	SubscriptionSlotAuthSnapshot,
	SubscriptionSlotAuthWrite,
} from "./active-subscription-slot.ts";

export type SubscriptionSlotAuthPlan = {
	readonly writes?: readonly SubscriptionSlotAuthWrite[];
	readonly deletes?: readonly SubscriptionSlotAuthDelete[];
};

/**
 * Read the current auth.json credential map. Missing or invalid files
 * become an empty snapshot.
 */
export function readSubscriptionSlotAuthSnapshot(
	authPath: string,
): SubscriptionSlotAuthSnapshot {
	return readStoredCredentials(readRawAuthMap(authPath));
}

/**
 * Apply slot writes then deletes to auth.json. A key that was written is
 * not deleted in the same plan. Other provider credentials stay untouched.
 */
export function applySubscriptionSlotAuthPlan(
	authPath: string,
	plan: SubscriptionSlotAuthPlan,
): SubscriptionSlotAuthSnapshot {
	const next = readRawAuthMap(authPath);
	const written = new Set<string>();

	for (const write of plan.writes ?? []) {
		next[write.key] = write.credential;
		written.add(write.key);
	}
	for (const remove of plan.deletes ?? []) {
		if (written.has(remove.key)) continue;
		delete next[remove.key];
	}

	writeAuthMap(authPath, next);
	return readStoredCredentials(next);
}

function readRawAuthMap(authPath: string): Record<string, unknown> {
	if (!existsSync(authPath)) return {};
	try {
		const raw: unknown = JSON.parse(readFileSync(authPath, "utf-8"));
		return raw && typeof raw === "object" && !Array.isArray(raw)
			? { ...raw as Record<string, unknown> }
			: {};
	} catch {
		return {};
	}
}

function readStoredCredentials(
	raw: Record<string, unknown>,
): Record<string, StoredSubscriptionCredential> {
	const snapshot: Record<string, StoredSubscriptionCredential> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (isStoredSubscriptionCredential(value)) snapshot[key] = value;
	}
	return snapshot;
}

function isStoredSubscriptionCredential(
	value: unknown,
): value is StoredSubscriptionCredential {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return typeof (value as { type?: unknown }).type === "string";
}

function writeAuthMap(
	authPath: string,
	auth: Record<string, unknown>,
): void {
	const dir = dirname(authPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
	try {
		chmodSync(authPath, 0o600);
	} catch {
		// Some test filesystems reject chmod. The write already succeeded.
	}
}
