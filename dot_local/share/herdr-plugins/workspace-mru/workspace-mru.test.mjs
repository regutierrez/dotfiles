import assert from "node:assert/strict";
import test from "node:test";

import {
	recordWorkspaceFocus,
	removeWorkspace,
	selectNextWorkspace,
} from "./workspace-mru.mjs";

function workspaces(focusedId, ids = ["A", "B", "C"]) {
	return ids.map((workspaceId) => ({
		workspace_id: workspaceId,
		focused: workspaceId === focusedId,
	}));
}

test("records workspaces from most to least recently used", () => {
	let state = {};
	state = recordWorkspaceFocus(state, "B");
	state = recordWorkspaceFocus(state, "C");
	state = recordWorkspaceFocus(state, "A");
	assert.deepEqual(state.mru, ["A", "C", "B"]);
});

test("uses MRU first and sidebar order for continued presses", () => {
	let state = {};
	for (const id of ["B", "C", "A"]) state = recordWorkspaceFocus(state, id);

	let selection = selectNextWorkspace(state, workspaces("A"), 1000);
	assert.equal(selection.target, "C");
	state = recordWorkspaceFocus(selection.state, "C");

	selection = selectNextWorkspace(state, workspaces("C"), 1250);
	assert.equal(selection.target, "A");
	state = recordWorkspaceFocus(selection.state, "A");

	selection = selectNextWorkspace(state, workspaces("A"), 1499);
	assert.equal(selection.target, "B");
});

test("starts a new MRU cycle when 500ms elapse", () => {
	let state = {};
	for (const id of ["B", "C", "A"]) state = recordWorkspaceFocus(state, id);
	let selection = selectNextWorkspace(state, workspaces("A"), 1000);
	state = recordWorkspaceFocus(selection.state, "C");

	selection = selectNextWorkspace(state, workspaces("C"), 1500);
	assert.equal(selection.target, "A");
	assert.deepEqual(selection.state.mru, ["C", "A", "B"]);
});

test("starts a fresh cycle after a workspace is focused another way", () => {
	let state = {};
	for (const id of ["B", "C", "A"]) state = recordWorkspaceFocus(state, id);
	let selection = selectNextWorkspace(state, workspaces("A"), 1000);
	state = recordWorkspaceFocus(selection.state, "C");
	state = recordWorkspaceFocus(state, "B");

	selection = selectNextWorkspace(state, workspaces("B"), 1100);
	assert.equal(selection.target, "A");
});

test("removes closed workspaces from history and an active cycle", () => {
	let state = {};
	for (const id of ["C", "B", "A"]) state = recordWorkspaceFocus(state, id);
	state = selectNextWorkspace(state, workspaces("A"), 1000).state;
	state = removeWorkspace(state, "C");
	assert.deepEqual(state.mru, ["A", "B"]);
	assert.deepEqual(state.cycle.order, ["A", "B"]);
	assert.deepEqual(state.pending, ["B"]);
});
