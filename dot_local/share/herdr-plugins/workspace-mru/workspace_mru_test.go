package main

import (
	"reflect"
	"testing"
)

func testWorkspaces(focusedID string, ids ...string) []HerdrWorkspaceRow {
	if len(ids) == 0 {
		ids = []string{"A", "B", "C"}
	}
	rows := make([]HerdrWorkspaceRow, len(ids))
	for index, id := range ids {
		rows[index] = HerdrWorkspaceRow{WorkspaceID: id, Focused: id == focusedID}
	}
	return rows
}

func TestRecordWorkspaceFocus(t *testing.T) {
	var state WorkspaceMRUState
	state = RecordWorkspaceFocus(state, "B")
	state = RecordWorkspaceFocus(state, "C")
	state = RecordWorkspaceFocus(state, "A")
	if !reflect.DeepEqual(state.MRU, []string{"A", "C", "B"}) {
		t.Fatalf("got %#v", state.MRU)
	}
}

func TestSelectNextWorkspaceMRUThenSidebar(t *testing.T) {
	var state WorkspaceMRUState
	for _, id := range []string{"B", "C", "A"} {
		state = RecordWorkspaceFocus(state, id)
	}

	state, target := SelectNextWorkspace(state, testWorkspaces("A"), 1000)
	if target != "C" {
		t.Fatalf("got %q", target)
	}
	state = RecordWorkspaceFocus(state, "C")

	state, target = SelectNextWorkspace(state, testWorkspaces("C"), 1250)
	if target != "A" {
		t.Fatalf("got %q", target)
	}
	state = RecordWorkspaceFocus(state, "A")

	_, target = SelectNextWorkspace(state, testWorkspaces("A"), 1499)
	if target != "B" {
		t.Fatalf("got %q", target)
	}
}

func TestSelectNextWorkspaceStartsFreshAfter500ms(t *testing.T) {
	var state WorkspaceMRUState
	for _, id := range []string{"B", "C", "A"} {
		state = RecordWorkspaceFocus(state, id)
	}
	state, _ = SelectNextWorkspace(state, testWorkspaces("A"), 1000)
	state = RecordWorkspaceFocus(state, "C")

	state, target := SelectNextWorkspace(state, testWorkspaces("C"), 1500)
	if target != "A" {
		t.Fatalf("got %q", target)
	}
	if !reflect.DeepEqual(state.MRU, []string{"C", "A", "B"}) {
		t.Fatalf("got %#v", state.MRU)
	}
}

func TestSelectNextWorkspaceStartsFreshAfterOtherFocus(t *testing.T) {
	var state WorkspaceMRUState
	for _, id := range []string{"B", "C", "A"} {
		state = RecordWorkspaceFocus(state, id)
	}
	state, _ = SelectNextWorkspace(state, testWorkspaces("A"), 1000)
	state = RecordWorkspaceFocus(state, "C")
	state = RecordWorkspaceFocus(state, "B")

	_, target := SelectNextWorkspace(state, testWorkspaces("B"), 1100)
	if target != "A" {
		t.Fatalf("got %q", target)
	}
}

func TestRemoveWorkspaceFromHistoryAndCycle(t *testing.T) {
	var state WorkspaceMRUState
	for _, id := range []string{"C", "B", "A"} {
		state = RecordWorkspaceFocus(state, id)
	}
	state, _ = SelectNextWorkspace(state, testWorkspaces("A"), 1000)
	state = RemoveWorkspace(state, "C")
	if !reflect.DeepEqual(state.MRU, []string{"A", "B"}) {
		t.Fatalf("mru %#v", state.MRU)
	}
	if state.Cycle == nil || !reflect.DeepEqual(state.Cycle.Order, []string{"A", "B"}) {
		t.Fatalf("cycle %#v", state.Cycle)
	}
	if !reflect.DeepEqual(state.Pending, []string{"B"}) {
		t.Fatalf("pending %#v", state.Pending)
	}
}
