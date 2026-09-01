package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const cycleTimeoutMs = 500

// WorkspaceMRUCycle is the in-progress prefix+tab cycle.
type WorkspaceMRUCycle struct {
	Order        []string `json:"order"`
	Target       string   `json:"target"`
	LastSwitchAt int64    `json:"lastSwitchAt"`
}

// WorkspaceMRUState is the persisted most-recently-used workspace list.
type WorkspaceMRUState struct {
	MRU     []string           `json:"mru"`
	Cycle   *WorkspaceMRUCycle `json:"cycle"`
	Pending []string           `json:"pending"`
}

// HerdrWorkspaceRow is one workspace from herdr workspace list.
type HerdrWorkspaceRow struct {
	WorkspaceID string `json:"workspace_id"`
	Focused     bool   `json:"focused"`
}

func containsID(ids []string, target string) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}

// RecordWorkspaceFocus records a space as most recently used, unless this focus was plugin-initiated.
func RecordWorkspaceFocus(state WorkspaceMRUState, workspaceID string) WorkspaceMRUState {
	for index, id := range state.Pending {
		if id == workspaceID {
			state.Pending = append(state.Pending[:index], state.Pending[index+1:]...)
			return state
		}
	}
	mru := []string{workspaceID}
	for _, id := range state.MRU {
		if id != workspaceID {
			mru = append(mru, id)
		}
	}
	return WorkspaceMRUState{MRU: mru, Cycle: nil, Pending: state.Pending}
}

// RemoveWorkspace drops a closed space from history and an active cycle.
func RemoveWorkspace(state WorkspaceMRUState, workspaceID string) WorkspaceMRUState {
	var order []string
	if state.Cycle != nil {
		for _, id := range state.Cycle.Order {
			if id != workspaceID {
				order = append(order, id)
			}
		}
	}
	var cycle *WorkspaceMRUCycle
	if len(order) > 0 && state.Cycle.Target != "" && state.Cycle.Target != workspaceID {
		cycle = &WorkspaceMRUCycle{
			Order:        order,
			Target:       state.Cycle.Target,
			LastSwitchAt: state.Cycle.LastSwitchAt,
		}
	}
	var mru []string
	for _, id := range state.MRU {
		if id != workspaceID {
			mru = append(mru, id)
		}
	}
	var pending []string
	for _, id := range state.Pending {
		if id != workspaceID {
			pending = append(pending, id)
		}
	}
	return WorkspaceMRUState{MRU: mru, Cycle: cycle, Pending: pending}
}

// SelectNextWorkspace chooses the previous space, then cycles in sidebar order.
func SelectNextWorkspace(state WorkspaceMRUState, workspaces []HerdrWorkspaceRow, nowMs int64) (WorkspaceMRUState, string) {
	var workspaceOrder []string
	var current string
	for _, workspace := range workspaces {
		if workspace.WorkspaceID == "" {
			continue
		}
		if !containsID(workspaceOrder, workspace.WorkspaceID) {
			workspaceOrder = append(workspaceOrder, workspace.WorkspaceID)
		}
		if workspace.Focused && current == "" {
			current = workspace.WorkspaceID
		}
	}
	state.MRU = filterIDs(state.MRU, workspaceOrder)
	state.Pending = filterIDs(state.Pending, workspaceOrder)
	for _, id := range workspaceOrder {
		if !containsID(state.MRU, id) {
			state.MRU = append(state.MRU, id)
		}
	}
	if current == "" || len(workspaceOrder) < 2 {
		return state, ""
	}

	continuing := state.Cycle != nil && state.Cycle.Target == current && nowMs-state.Cycle.LastSwitchAt < cycleTimeoutMs
	if !continuing {
		mru := []string{current}
		for _, id := range state.MRU {
			if id != current {
				mru = append(mru, id)
			}
		}
		state.MRU = mru
		state.Cycle = nil
	}

	var order []string
	if continuing {
		for _, id := range state.Cycle.Order {
			if containsID(workspaceOrder, id) {
				order = append(order, id)
			}
		}
		for _, id := range workspaceOrder {
			if !containsID(order, id) {
				order = append(order, id)
			}
		}
	} else {
		order = append(order, workspaceOrder...)
	}

	var target string
	if continuing {
		index := -1
		for i, id := range order {
			if id == current {
				index = i
				break
			}
		}
		target = order[(index+1)%len(order)]
	} else {
		for _, id := range state.MRU {
			if id != current {
				target = id
				break
			}
		}
	}
	state.Cycle = &WorkspaceMRUCycle{Order: order, Target: target, LastSwitchAt: nowMs}
	state.Pending = append(state.Pending, target)
	return state, target
}

func filterIDs(values, allowed []string) []string {
	var filtered []string
	for _, id := range values {
		if containsID(allowed, id) {
			filtered = append(filtered, id)
		}
	}
	return filtered
}

func readWorkspaceMRUState(stateDir string) (WorkspaceMRUState, error) {
	payload, err := os.ReadFile(filepath.Join(stateDir, "state.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return WorkspaceMRUState{}, nil
		}
		return WorkspaceMRUState{}, err
	}
	var state WorkspaceMRUState
	if err := json.Unmarshal(payload, &state); err != nil {
		return WorkspaceMRUState{}, err
	}
	return state, nil
}

func writeWorkspaceMRUState(stateDir string, state WorkspaceMRUState) error {
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}
	temporaryPath := filepath.Join(stateDir, fmt.Sprintf("state.%d.tmp", os.Getpid()))
	if err := os.WriteFile(temporaryPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(temporaryPath, filepath.Join(stateDir, "state.json"))
}

func runWorkspaceMRU(operation string) error {
	stateDir := os.Getenv("HERDR_PLUGIN_STATE_DIR")
	if stateDir == "" {
		return fmt.Errorf("Herdr did not provide the plugin state directory")
	}
	switch operation {
	case "switch":
		result, listErr := runHerdrCommand("workspace", "list")
		if listErr != nil {
			return listErr
		}
		var body struct {
			Workspaces []HerdrWorkspaceRow `json:"workspaces"`
		}
		if err := json.Unmarshal(result, &body); err != nil {
			return err
		}
		return withStateDirectoryLock(stateDir, func() error {
			state, readErr := readWorkspaceMRUState(stateDir)
			if readErr != nil {
				return readErr
			}
			state, target := SelectNextWorkspace(state, body.Workspaces, time.Now().UnixMilli())
			if target != "" {
				if _, focusErr := runHerdrCommand("workspace", "focus", target); focusErr != nil {
					return focusErr
				}
			}
			return writeWorkspaceMRUState(stateDir, state)
		})
	case "focused", "closed":
		workspaceID := os.Getenv("HERDR_WORKSPACE_ID")
		if workspaceID == "" {
			return fmt.Errorf("Herdr did not provide the event workspace ID")
		}
		return withStateDirectoryLock(stateDir, func() error {
			state, readErr := readWorkspaceMRUState(stateDir)
			if readErr != nil {
				return readErr
			}
			if operation == "closed" {
				state = RemoveWorkspace(state, workspaceID)
			} else {
				state = RecordWorkspaceFocus(state, workspaceID)
			}
			return writeWorkspaceMRUState(stateDir, state)
		})
	default:
		return fmt.Errorf("unknown operation: %s", operation)
	}
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
	operation := ""
	if len(os.Args) > 1 {
		operation = os.Args[1]
	}
	if err := runWorkspaceMRU(operation); err != nil {
		fmt.Fprintf(os.Stderr, "workspace-mru: %v\n", err)
		os.Exit(1)
	}
}
