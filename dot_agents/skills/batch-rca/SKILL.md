---
name: batch-rca
description: Batch-create Investigatr MDX docs for filtered Linear tickets using one subagent per ticket. Use when explicitly asked to batch missing Investigatr investigations, fan out Linear tickets, or run investigation subagents.
disable-model-invocation: true
compatibility: Requires linear-cli, pup, jq, and npm. Fallback orchestration requires tmux; Codex CLI is optional but preferred for tmux fallback.
---

# RCA Batch Authoring

Target repo is always `/Users/pakkio/playground/investigatr`. Per-ticket investigation writing must follow `/Users/pakkio/.agents/skills/rca/SKILL.md`.

## Defaults

- **Timeframe:** current calendar week by Linear `createdAt`, from Monday 00:00 UTC through now.
- **Ordering:** newest first by `createdAt`.
- **Concurrency:** 2 tickets at a time unless the user overrides.
- **One worker per ticket:** each subagent/session gets exactly one Linear ticket ID.
- **Missing-only:** skip any ticket with an existing folder at `src/content/investigations/<TICKET-ID>/`.
- **Duplicates:** skip tickets whose Linear state is `Duplicate` or whose relations mark them as duplicates, unless the user explicitly asks to document duplicates.

If the user gives a timeframe (`today`, `yesterday`, `Jun 3`, `last 2 weeks`, explicit dates), use that instead of the current-week default. If the user gives explicit ticket IDs, use those IDs instead of the default filter, but still check duplicate/existing status unless overridden.

## Default Linear filter

The default scope is the Horizon/Triage investigation backlog discussed for Investigatr:

1. TRI tickets where:
   - team key is `TRI`
   - state is one of `Todo`, `Backlog`, `In Progress`
   - `createdAt` is inside the selected timeframe
   - labels include `Triage Tool` **AND** at least one label whose name starts with `Horizon`
2. AKKIO tickets where:
   - team key is `AKKIO`
   - state is one of `Todo`, `Backlog`, `In Progress`
   - `createdAt` is inside the selected timeframe
   - project name is `Bugs`
   - labels include `Horizon`

User overrides may change any part of this filter: teams, labels, states, project, timeframe, ordering, duplicate behavior, or concurrency. Restate the effective filter before launching workers.

## Inventory procedure

1. Read the requested timeframe/filter and restate it.
2. Use `linear-cli` for Linear reads. Do not use Linear MCP unless `linear-cli` is unavailable.
3. Fetch candidates with paginated GraphQL or `linear-cli` issue commands. Keep machine-readable JSON.
4. Build an inventory with: `identifier`, `title`, `url`, `createdAt`, `state.name`, `team.key`, `project.name`, label names, duplicate/relations summary, and `has_investigation`.
5. Remove existing investigations and duplicates unless overridden.
6. Save inventory and launch metadata under `/tmp/investigatr-batch-<YYYYMMDD-HHMMSS>/`.

Useful duplicate checks:

```sh
linear-cli relations list <TICKET-ID> --output json --compact --all
# If needed, use GraphQL for parent/children/relations/state.
```

Useful existing-doc check:

```sh
test -d /Users/pakkio/playground/investigatr/src/content/investigations/<TICKET-ID>
```

## Worker orchestration

Prefer a native subagent/task feature if the current harness exposes one. If no subagent feature exists, fall back to tmux sessions.

### Native subagent mode

Spawn one subagent per ticket. Do not assign multiple tickets to one subagent. Pass the subagent the prompt contract below and collect the subagent's final response. Require the final response to end with `## TLDR` so the main agent can aggregate it.

### tmux fallback mode

Load the tmux skill. Use the shared private socket convention:

```sh
SOCKET_DIR=${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"
```

Start at most the configured concurrency. Name sessions `investigatr-<ticket-id>` or `codex-<ticket-id>`. Immediately tell the user how to monitor each session:

```sh
tmux -S "$SOCKET" attach -t <session>
tmux -S "$SOCKET" capture-pane -p -J -t <session>:0.0 -S -200
```

For Codex CLI fallback, prefer a non-interactive invocation with `--output-last-message` so TLDR aggregation is deterministic. Use the installed Codex binary if present (`codex`, `openai-codex`, or `/Applications/Codex.app/Contents/Resources/codex`). Example:

```sh
CODEX=/Applications/Codex.app/Contents/Resources/codex
"$CODEX" exec \
  -m gpt-5.5 \
  -c model_reasoning_effort=\"xhigh\" \
  -C /Users/pakkio/playground/investigatr \
  --add-dir /Users/pakkio/Akkio \
  --add-dir /Users/pakkio/.wt/pakkio/Akkio \
  --add-dir /tmp \
  --output-last-message "$BATCH/<TICKET-ID>.last.md" \
  - < "$BATCH/<TICKET-ID>.prompt.md" \
  > "$BATCH/<TICKET-ID>.log" 2>&1
```

If `linear-cli` or `pup` fails only because the agent sandbox blocks keychain/network access, rerun that ticket with the narrowest stronger sandbox available (for Codex, `-s danger-full-access`) and record that reason in the aggregate. Do not start auth flows unless the user explicitly asks.

## Per-ticket worker prompt contract

Every worker prompt must include:

```text
You are a subagent for Investigatr batch authoring.
Ticket: <TICKET-ID>

Mandatory:
1. Read and follow /Users/pakkio/.agents/skills/rca/SKILL.md.
2. Work in /Users/pakkio/playground/investigatr. Application code: grab the environment from the Linear issue description, then find the worktree (git -C ~/Akkio worktree list) whose branch tracks origin/release/horizon-production (production) or origin/release/horizon-staging (staging); confirm with git branch -vv. Run git pull there before reading code. Never read from ~/Akkio itself; if no worktree tracks the env branch, report it instead of substituting another checkout.
3. Use linear-cli for Linear and pup for Datadog. Do not start auth flows.
4. Check whether this ticket already has an investigation or is a Linear duplicate. If duplicate/existing, skip and report it.
5. If not skipped, create only src/content/investigations/<TICKET-ID>/index.mdx and optional assets under that folder.
6. Back every root-cause claim with Linear, Datadog, code, or data evidence. Show the key logs inline in the MDX Root cause section.
7. Include every required section from the rca skill (frontmatter, Summary, TLDR, Timeline (ET), Root cause, Root cause confidence, How it broke — call stack & flow, ELI5 walkthrough, Reproduction steps, Manual validation required, Possible fixes, Shareable comment).
8. Run npm run build if feasible. If it fails on an unrelated pre-existing MDX issue, report the exact error and do not fix unrelated files.
9. Final response must end with a section titled exactly "## TLDR" with bullets for: created/skipped path, duplicate/canonical status, root cause or unknown, strongest evidence, build/validation status, blockers/next query.
```

## Main-agent aggregation

After each worker finishes:

1. Read the worker's final response (`--output-last-message` file in tmux fallback, or subagent final message in native mode).
2. Verify expected output:
   - if created: `src/content/investigations/<TICKET-ID>/index.mdx` exists
   - if skipped: final TLDR explains existing/duplicate/blocker
   - final response contains `## TLDR`
3. Optionally run a targeted MDX compile for new docs, then run `npm run build` once at the end when feasible.
4. Write `/tmp/investigatr-batch-<timestamp>/aggregate.md` containing every worker TLDR.
5. Report to the user with: created docs, skipped docs, duplicate mappings, build status, blockers, and the aggregate path.
6. If using tmux, repeat the monitor/capture commands in the final report.

Do not silently continue to a new timeframe or unrelated ticket batch after completing the requested inventory. Ask before expanding scope.
