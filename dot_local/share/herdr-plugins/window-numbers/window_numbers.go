package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
)

var (
	onlyWindowNumber = regexp.MustCompile(`^\d+$`)
	windowNumberRest = regexp.MustCompile(`^(\d+)(?::\s*|\s+|-)(.*)$`)
)

// HerdrTabWindow is one Herdr tab (window) in workspace tab-list order.
type HerdrTabWindow struct {
	TabID string
	Label string
}

// StripWindowNumberPrefix removes repeated leading space-local window numbers.
// It strips `3`, `3 rest`, `3: rest`, and `3-rest`. Names such as `2fa work` stay intact.
func StripWindowNumberPrefix(label string) string {
	text := strings.TrimSpace(label)
	for text != "" {
		if onlyWindowNumber.MatchString(text) {
			return ""
		}
		match := windowNumberRest.FindStringSubmatch(text)
		if match == nil {
			return text
		}
		text = strings.TrimSpace(match[2])
	}
	return text
}

// TabRenamesForWindowNumbers returns the tab renames needed for current space-local numbers.
func TabRenamesForWindowNumbers(tabs []HerdrTabWindow) []HerdrTabWindow {
	return windowNumberTabRenames(tabs, false, "")
}

// TabStampsForWindowNumbers rewrites every tab, including labels that already match.
// Herdr auto-numbers tabs that have no custom name; stamping stores a custom name so
// native compacting does not run after a close.
func TabStampsForWindowNumbers(tabs []HerdrTabWindow) []HerdrTabWindow {
	return windowNumberTabRenames(tabs, true, "")
}

func windowNumberTabRenames(tabs []HerdrTabWindow, stampAll bool, stampTabID string) []HerdrTabWindow {
	stampTabID = strings.TrimSpace(stampTabID)
	var renames []HerdrTabWindow
	for index, tab := range tabs {
		label := strconv.Itoa(index + 1)
		if rest := StripWindowNumberPrefix(tab.Label); rest != "" {
			label += " " + rest
		}
		if strings.TrimSpace(tab.Label) != label || stampAll || tab.TabID == stampTabID {
			renames = append(renames, HerdrTabWindow{TabID: tab.TabID, Label: label})
		}
	}
	return renames
}

// ParseHerdrTabWindows parses herdr tab list JSON into workspace tab order.
func ParseHerdrTabWindows(payload []byte) []HerdrTabWindow {
	var body struct {
		Tabs []struct {
			TabID string `json:"tab_id"`
			Label string `json:"label"`
		} `json:"tabs"`
	}
	if json.Unmarshal(payload, &body) != nil {
		return nil
	}
	var tabs []HerdrTabWindow
	for _, tab := range body.Tabs {
		tabID := strings.TrimSpace(tab.TabID)
		if tabID == "" {
			continue
		}
		tabs = append(tabs, HerdrTabWindow{TabID: tabID, Label: tab.Label})
	}
	return tabs
}

// ParseHerdrWorkspaceIDs parses herdr workspace list JSON into workspace ids.
func ParseHerdrWorkspaceIDs(payload []byte) []string {
	var body struct {
		Workspaces []struct {
			WorkspaceID string `json:"workspace_id"`
		} `json:"workspaces"`
	}
	if json.Unmarshal(payload, &body) != nil {
		return nil
	}
	var ids []string
	for _, workspace := range body.Workspaces {
		addWorkspaceID(&ids, workspace.WorkspaceID)
	}
	return ids
}

type windowNumberEventFields struct {
	WorkspaceID string `json:"workspace_id"`
	TabID       string `json:"tab_id"`
	Tab         *struct {
		WorkspaceID string `json:"workspace_id"`
		TabID       string `json:"tab_id"`
	} `json:"tab"`
}

// WorkspaceIDsForWindowNumberEvent returns workspace ids to renumber.
// startup returns an empty list so the caller enumerates every live space.
// It reads both inner event data and the Herdr EventEnvelope `{event, data}` wrapper.
func WorkspaceIDsForWindowNumberEvent(eventName string, eventJSON []byte, envWorkspaceID string) []string {
	ids, _ := WindowNumberEventTargets(eventName, eventJSON, envWorkspaceID)
	return ids
}

// WindowNumberEventTargets returns workspace ids and the event tab id, if any.
func WindowNumberEventTargets(eventName string, eventJSON []byte, envWorkspaceID string) ([]string, string) {
	if eventName == "startup" {
		return nil, ""
	}
	var ids []string
	addWorkspaceID(&ids, envWorkspaceID)
	tabID := ""
	if len(eventJSON) == 0 {
		return ids, tabID
	}
	var body struct {
		windowNumberEventFields
		Data *windowNumberEventFields `json:"data"`
	}
	if json.Unmarshal(eventJSON, &body) != nil {
		return ids, tabID
	}
	tabID = addWindowNumberEventFields(&ids, body.windowNumberEventFields, tabID)
	if body.Data != nil {
		tabID = addWindowNumberEventFields(&ids, *body.Data, tabID)
	}
	return ids, tabID
}

func addWindowNumberEventFields(ids *[]string, fields windowNumberEventFields, tabID string) string {
	addWorkspaceID(ids, fields.WorkspaceID)
	if strings.TrimSpace(fields.TabID) != "" {
		tabID = strings.TrimSpace(fields.TabID)
	}
	if fields.Tab != nil {
		addWorkspaceID(ids, fields.Tab.WorkspaceID)
		if strings.TrimSpace(fields.Tab.TabID) != "" {
			tabID = strings.TrimSpace(fields.Tab.TabID)
		}
	}
	return tabID
}

func addWorkspaceID(ids *[]string, value string) {
	workspaceID := strings.TrimSpace(value)
	if workspaceID == "" {
		return
	}
	for _, existing := range *ids {
		if existing == workspaceID {
			return
		}
	}
	*ids = append(*ids, workspaceID)
}

func renameWorkspaceWindowNumbers(workspaceID string, stampAll bool, stampTabID string) error {
	result, err := runHerdrCommand("tab", "list", "--workspace", workspaceID)
	if err != nil {
		return nil
	}
	for _, rename := range windowNumberTabRenames(ParseHerdrTabWindows(result), stampAll, stampTabID) {
		if _, err := runHerdrCommand("tab", "rename", rename.TabID, rename.Label); err != nil {
			return err
		}
	}
	return nil
}

func runWindowNumbers(eventName string) error {
	event := strings.TrimSpace(eventName)
	if event == "" {
		event = "startup"
	}
	var workspaceIDs []string
	stampAll := false
	stampTabID := ""
	if event == "startup" {
		result, err := runHerdrCommand("workspace", "list")
		if err != nil {
			return err
		}
		workspaceIDs = ParseHerdrWorkspaceIDs(result)
		stampAll = true
	} else {
		var eventTabID string
		workspaceIDs, eventTabID = WindowNumberEventTargets(
			event,
			[]byte(os.Getenv("HERDR_PLUGIN_EVENT_JSON")),
			os.Getenv("HERDR_WORKSPACE_ID"),
		)
		if event == "tab.created" {
			stampTabID = eventTabID
			if stampTabID == "" {
				stampAll = true
			}
		}
		if len(workspaceIDs) == 0 {
			return nil
		}
	}
	stateDir := os.Getenv("HERDR_PLUGIN_STATE_DIR")
	if stateDir == "" {
		return fmt.Errorf("Herdr did not provide the plugin state directory")
	}
	return withStateDirectoryLock(stateDir, func() error {
		for _, workspaceID := range workspaceIDs {
			if err := renameWorkspaceWindowNumbers(workspaceID, stampAll, stampTabID); err != nil {
				return err
			}
		}
		return nil
	})
}

func runHerdrCommand(args ...string) (json.RawMessage, error) {
	bin := os.Getenv("HERDR_BIN_PATH")
	if bin == "" {
		bin = "herdr"
	}
	command := exec.Command(bin, args...)
	output, err := command.Output()
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			detail := string(exit.Stderr)
			if detail == "" {
				detail = string(output)
			}
			if trimmed := trimHerdrError(detail); trimmed != "" {
				return nil, fmt.Errorf("%s", trimmed)
			}
			return nil, fmt.Errorf("%s exited with status %d", filepath.Base(bin), exit.ExitCode())
		}
		return nil, err
	}
	var envelope struct {
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(output, &envelope); err != nil {
		return nil, fmt.Errorf("Herdr returned malformed JSON: %s", trimHerdrError(string(output)))
	}
	if len(envelope.Result) == 0 {
		return nil, fmt.Errorf("Herdr response did not contain a result")
	}
	return envelope.Result, nil
}

func withStateDirectoryLock(stateDir string, fn func() error) error {
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(filepath.Join(stateDir, "state.lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	return fn()
}

func trimHerdrError(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) > 200 {
		return trimmed[:200]
	}
	return trimmed
}

func main() {
	if err := runWindowNumbers(os.Getenv("HERDR_PLUGIN_EVENT")); err != nil {
		fmt.Fprintf(os.Stderr, "window-numbers: %v\n", err)
		os.Exit(1)
	}
}
