import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const CYCLE_TIMEOUT_MS = 500;

function uniqueWorkspaceIds(values) {
	const ids = [];
	for (const value of values ?? []) {
		if (typeof value === "string" && value && !ids.includes(value)) ids.push(value);
	}
	return ids;
}

function normalizeState(value = {}) {
	const mru = uniqueWorkspaceIds(value.mru);
	const pending = (value.pending ?? []).filter((id) => typeof id === "string" && id);
	const order = uniqueWorkspaceIds(value.cycle?.order);
	const target = typeof value.cycle?.target === "string" ? value.cycle.target : undefined;
	const lastSwitchAt = Number.isFinite(value.cycle?.lastSwitchAt)
		? value.cycle.lastSwitchAt
		: 0;
	const cycle = order.length > 0 && target && order.includes(target)
		? { order, target, lastSwitchAt }
		: null;
	return { mru, cycle, pending };
}

export function recordWorkspaceFocus(value, workspaceId) {
	const state = normalizeState(value);
	const pendingIndex = state.pending.indexOf(workspaceId);
	if (pendingIndex >= 0) {
		state.pending.splice(pendingIndex, 1);
		return state;
	}
	return {
		mru: [workspaceId, ...state.mru.filter((id) => id !== workspaceId)],
		cycle: null,
		pending: state.pending,
	};
}

export function removeWorkspace(value, workspaceId) {
	const state = normalizeState(value);
	const order = state.cycle?.order.filter((id) => id !== workspaceId) ?? [];
	const target = state.cycle?.target;
	return {
		mru: state.mru.filter((id) => id !== workspaceId),
		cycle: order.length > 0 && target && target !== workspaceId
			? { order, target, lastSwitchAt: state.cycle.lastSwitchAt }
			: null,
		pending: state.pending.filter((id) => id !== workspaceId),
	};
}

export function selectNextWorkspace(value, workspaces, now = Date.now()) {
	const workspaceOrder = uniqueWorkspaceIds(workspaces.map((workspace) => workspace.workspace_id));
	const current = workspaces.find((workspace) => workspace.focused)?.workspace_id;
	let state = normalizeState(value);
	state.mru = state.mru.filter((id) => workspaceOrder.includes(id));
	state.pending = state.pending.filter((id) => workspaceOrder.includes(id));
	for (const id of workspaceOrder) {
		if (!state.mru.includes(id)) state.mru.push(id);
	}

	if (!current || workspaceOrder.length < 2) return { state, target: undefined };

	const continuing = state.cycle?.target === current
		&& now - state.cycle.lastSwitchAt < CYCLE_TIMEOUT_MS;
	if (!continuing) {
		state.mru = [current, ...state.mru.filter((id) => id !== current)];
		state.cycle = null;
	}

	const order = continuing
		? state.cycle.order.filter((id) => workspaceOrder.includes(id))
		: [...workspaceOrder];
	for (const id of workspaceOrder) {
		if (!order.includes(id)) order.push(id);
	}
	const target = continuing
		? order[(order.indexOf(current) + 1) % order.length]
		: state.mru.find((id) => id !== current);
	state.cycle = { order, target, lastSwitchAt: now };
	state.pending.push(target);
	return { state, target };
}

function readState(stateDirectory) {
	try {
		return normalizeState(JSON.parse(readFileSync(join(stateDirectory, "state.json"), "utf8")));
	} catch (error) {
		if (error?.code === "ENOENT") return normalizeState();
		throw error;
	}
}

function writeState(stateDirectory, state) {
	const temporaryPath = join(stateDirectory, `state.${process.pid}.tmp`);
	writeFileSync(temporaryPath, `${JSON.stringify(normalizeState(state))}\n`, { mode: 0o600 });
	renameSync(temporaryPath, join(stateDirectory, "state.json"));
}

function wait(milliseconds) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireLock(lockPath) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			mkdirSync(lockPath);
			return;
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			try {
				if (Date.now() - statSync(lockPath).mtimeMs > 5000) rmSync(lockPath, { recursive: true });
			} catch (statError) {
				if (statError?.code !== "ENOENT") throw statError;
			}
			wait(10);
		}
	}
	throw new Error("timed out waiting for the state lock");
}

function updateState(stateDirectory, update) {
	mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
	const lockPath = join(stateDirectory, "lock");
	acquireLock(lockPath);
	try {
		const result = update(readState(stateDirectory));
		writeState(stateDirectory, result.state);
		return result.value;
	} finally {
		rmSync(lockPath, { recursive: true, force: true });
	}
}

function herdr(args) {
	const command = process.env.HERDR_BIN_PATH ?? "herdr";
	const result = spawnSync(command, args, { encoding: "utf8", env: process.env });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const detail = (result.stderr || result.stdout).trim();
		throw new Error(detail || `${basename(command)} exited with status ${result.status}`);
	}
	let response;
	try {
		response = JSON.parse(result.stdout);
	} catch {
		throw new Error(`Herdr returned malformed JSON: ${result.stdout.trim().slice(0, 200)}`);
	}
	if (!response.result) throw new Error("Herdr response did not contain a result");
	return response.result;
}

function stateDirectory() {
	const directory = process.env.HERDR_PLUGIN_STATE_DIR;
	if (!directory) throw new Error("Herdr did not provide the plugin state directory");
	return directory;
}

function eventWorkspaceId() {
	const workspaceId = process.env.HERDR_WORKSPACE_ID;
	if (!workspaceId) throw new Error("Herdr did not provide the event workspace ID");
	return workspaceId;
}

function switchWorkspace(directory) {
	updateState(directory, (state) => {
		const workspaces = herdr(["workspace", "list"]).workspaces ?? [];
		const selection = selectNextWorkspace(state, workspaces);
		if (selection.target) herdr(["workspace", "focus", selection.target]);
		return { state: selection.state };
	});
}

export function main(operation = process.argv[2]) {
	const directory = stateDirectory();
	if (operation === "switch") {
		switchWorkspace(directory);
		return;
	}
	const workspaceId = eventWorkspaceId();
	if (operation === "focused") {
		updateState(directory, (state) => ({
			state: recordWorkspaceFocus(state, workspaceId),
		}));
		return;
	}
	if (operation === "closed") {
		updateState(directory, (state) => ({
			state: removeWorkspace(state, workspaceId),
		}));
		return;
	}
	throw new Error(`unknown operation: ${operation ?? ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main();
	} catch (error) {
		console.error(`workspace-mru: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}
