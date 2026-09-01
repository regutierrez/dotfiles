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
	var renames []HerdrTabWindow
	for index, tab := range tabs {
		label := strconv.Itoa(index + 1)
		if rest := StripWindowNumberPrefix(tab.Label); rest != "" {
			label += " " + rest
		}
		if strings.TrimSpace(tab.Label) != label {
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

// WorkspaceIDsForWindowNumberEvent returns workspace ids to renumber.
// startup returns an empty list so the caller enumerates every live space.
func WorkspaceIDsForWindowNumberEvent(eventName string, eventJSON []byte, envWorkspaceID string) []string {
	if eventName == "startup" {
		return nil
	}
	var ids []string
	addWorkspaceID(&ids, envWorkspaceID)
	if len(eventJSON) == 0 {
		return ids
	}
	var body struct {
		WorkspaceID string `json:"workspace_id"`
		Tab         *struct {
			WorkspaceID string `json:"workspace_id"`
		} `json:"tab"`
	}
	if json.Unmarshal(eventJSON, &body) != nil {
		return ids
	}
	addWorkspaceID(&ids, body.WorkspaceID)
	if body.Tab != nil {
		addWorkspaceID(&ids, body.Tab.WorkspaceID)
	}
	return ids
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

func renameWorkspaceWindowNumbers(workspaceID string) error {
	result, err := runHerdrCommand("tab", "list", "--workspace", workspaceID)
	if err != nil {
		return nil
	}
	for _, rename := range TabRenamesForWindowNumbers(ParseHerdrTabWindows(result)) {
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
	if event == "startup" {
		result, err := runHerdrCommand("workspace", "list")
		if err != nil {
			return err
		}
		workspaceIDs = ParseHerdrWorkspaceIDs(result)
	} else {
		workspaceIDs = WorkspaceIDsForWindowNumberEvent(
			event,
			[]byte(os.Getenv("HERDR_PLUGIN_EVENT_JSON")),
			os.Getenv("HERDR_WORKSPACE_ID"),
		)
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
			if err := renameWorkspaceWindowNumbers(workspaceID); err != nil {
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
