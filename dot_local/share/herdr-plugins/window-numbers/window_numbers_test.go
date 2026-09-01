package main

import (
	"testing"
)

func TestStripWindowNumberPrefix(t *testing.T) {
	cases := []struct {
		label string
		rest  string
	}{
		{"", ""},
		{"  3  ", ""},
		{"2 processes", "processes"},
		{"2 (TRI-1234)", "(TRI-1234)"},
		{"3: TRI-1234", "TRI-1234"},
		{"1-srv", "srv"},
		{"1 1-srv", "srv"},
		{"4 5-TRI-7293", "TRI-7293"},
		{"dotfiles", "dotfiles"},
		{"2fa work", "2fa work"},
	}
	for _, test := range cases {
		if got := StripWindowNumberPrefix(test.label); got != test.rest {
			t.Fatalf("%q: got %q want %q", test.label, got, test.rest)
		}
	}
}

func TestTabRenamesForWindowNumbers(t *testing.T) {
	tabs := ParseHerdrTabWindows([]byte(`{"tabs":[
		{"tab_id":"w2N:t1","label":"processes"},
		{"tab_id":"w2N:tS","label":"2 dotfiles"},
		{"tab_id":"w2N:t0","label":"4: TRI-1234"}
	]}`))
	assertTabs(t, TabRenamesForWindowNumbers(tabs), []HerdrTabWindow{
		{TabID: "w2N:t1", Label: "1 processes"},
		{TabID: "w2N:t0", Label: "3 TRI-1234"},
	})
}

func TestStripsDoubledHyphenWindowNumber(t *testing.T) {
	tabs := ParseHerdrTabWindows([]byte(`{"tabs":[
		{"tab_id":"w2K:t3","label":"1 1-srv"},
		{"tab_id":"w2K:t2","label":"2 2-rca"},
		{"tab_id":"w2K:tA","label":"4 5-TRI-7293"}
	]}`))
	assertTabs(t, TabRenamesForWindowNumbers(tabs), []HerdrTabWindow{
		{TabID: "w2K:t3", Label: "1 srv"},
		{TabID: "w2K:t2", Label: "2 rca"},
		{TabID: "w2K:tA", Label: "3 TRI-7293"},
	})
}

func TestCompactsWindowNumbersAfterClose(t *testing.T) {
	tabs := ParseHerdrTabWindows([]byte(`{"tabs":[
		{"tab_id":"w2N:tS","label":"2 dotfiles"},
		{"tab_id":"w2N:t0","label":"3"}
	]}`))
	assertTabs(t, TabRenamesForWindowNumbers(tabs), []HerdrTabWindow{
		{TabID: "w2N:tS", Label: "1 dotfiles"},
		{TabID: "w2N:t0", Label: "2"},
	})
}

func TestWorkspaceIDsForWindowNumberEvent(t *testing.T) {
	got := ParseHerdrWorkspaceIDs([]byte(`{"workspaces":[{"workspace_id":"w2N"},{"workspace_id":"w2K"}]}`))
	if len(got) != 2 || got[0] != "w2N" || got[1] != "w2K" {
		t.Fatalf("got %#v", got)
	}
	ids := WorkspaceIDsForWindowNumberEvent("tab.closed", []byte("not-json"), "")
	if len(ids) != 0 {
		t.Fatalf("invalid event JSON should add no ids, got %#v", ids)
	}
	if ids := WorkspaceIDsForWindowNumberEvent("startup", []byte(`{"workspace_id":"w2N"}`), "w2N"); len(ids) != 0 {
		t.Fatalf("startup should skip event ids, got %#v", ids)
	}
	ids = WorkspaceIDsForWindowNumberEvent("tab.closed", []byte(`{"type":"tab_closed","tab_id":"w2N:t1","workspace_id":"w2N"}`), "")
	if len(ids) != 1 || ids[0] != "w2N" {
		t.Fatalf("got %#v", ids)
	}
	ids = WorkspaceIDsForWindowNumberEvent("tab.created", []byte(`{"type":"tab_created","tab":{"tab_id":"w2K:t8","workspace_id":"w2K"}}`), "")
	if len(ids) != 1 || ids[0] != "w2K" {
		t.Fatalf("got %#v", ids)
	}
}

func assertTabs(t *testing.T, got, want []HerdrTabWindow) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("got %#v want %#v", got, want)
		}
	}
}
