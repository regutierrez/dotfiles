---
name: batch-rca
description: Batch-create Investigatr MDX docs for filtered Linear tickets using one subagent per ticket. Use when explicitly asked to batch missing Investigatr investigations, fan out Linear tickets, or run investigation subagents.
disable-model-invocation: true
compatibility: Requires jq, npm, @tintinweb/pi-subagents, and the evidence tools listed in the rca skill's reference/evidence-access.md.
---

# RCA Batch Authoring

Target repo is the local Investigatr checkout (`~/repos/investigatr/main` on this workstation; discover it rather than assuming). Per-ticket investigation writing must follow `~/.agents/skills/rca/SKILL.md`.

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
2. Read Linear through the path the rca skill's `reference/evidence-access.md` names for this harness.
3. Fetch candidates with paginated queries. Keep machine-readable JSON.
4. Build an inventory with: `identifier`, `title`, `url`, `createdAt`, `state.name`, `team.key`, `project.name`, label names, duplicate/relations summary, and `has_investigation`.
5. Remove existing investigations and duplicates unless overridden.
6. Save inventory and launch metadata under `/tmp/investigatr-batch-<YYYYMMDD-HHMMSS>/`.

Useful duplicate checks:

Read each candidate's relations, parent, children, and state; a ticket marked duplicate of another is skipped.

Useful existing-doc check:

```sh
test -d <investigatr>/src/content/investigations/<TICKET-ID>
```

## Worker orchestration

Use `@tintinweb/pi-subagents` and launch one background `impl` agent per ticket with the `Agent` tool. Set `run_in_background: true`, use the ticket ID in the agent name and description, and keep each prompt self-contained. Do not assign multiple tickets to one subagent. Keep each returned agent ID and collect its final result with `get_subagent_result`. Require the final response to end with `## TLDR` so the main agent can aggregate it.

Start at most the configured concurrency. Before launching, verify that `impl` appears in the `Agent` tool's available type list. If `impl` is unavailable, stop and report that blocker instead of substituting another orchestration path.

If an evidence tool fails only because the subagent environment lacks keychain or network access, rerun that ticket with the narrowest stronger environment available and record that reason in the aggregate. Do not start auth flows unless the user explicitly asks.

## Per-ticket worker prompt contract

Every worker prompt must include:

```text
You are a subagent for Investigatr batch authoring.
Ticket: <TICKET-ID>

Mandatory:
1. Read and follow ~/.agents/skills/rca/SKILL.md, including its reference files.
2. Work in the local Investigatr checkout. Application code: grab the environment from the Linear issue description, then find the Akkio worktree (resolve the default-branch checkout, then git worktree list) whose branch tracks origin/release/horizon-production (production) or origin/release/horizon-staging (staging); confirm with git branch -vv. Fetch there and read the incident revision with git show <sha>:<path>; do not pull or switch a worktree you do not own. If no worktree tracks the env branch, report it instead of substituting another checkout.
3. Read Linear and Datadog through the paths in the rca skill's reference/evidence-access.md. Do not start auth flows.
4. Check whether this ticket already has an investigation or is a Linear duplicate. If duplicate/existing, skip and report it.
5. If not skipped, create only src/content/investigations/<TICKET-ID>/index.mdx and optional assets under that folder.
6. Back every root-cause claim with Linear, Datadog, code, or data evidence. Show the key logs inline in the MDX Root cause section.
7. Include every required section from the rca skill: frontmatter, TLDR, Issue and scope, Timeline (ET), Root cause, How it broke — call path and failure flow, Reproduction and validation, Resolution handoff, Residual gaps / next evidence. Do not propose a fix.
8. Run npm run build if feasible. If it fails on an unrelated pre-existing MDX issue, report the exact error and do not fix unrelated files.
9. Final response must end with a section titled exactly "## TLDR" with bullets for: created/skipped path, duplicate/canonical status, root cause or unknown, strongest evidence, build/validation status, blockers/next query.
```

## Main-agent aggregation

After each worker finishes:

1. Read the worker's final response from the `impl` subagent result.
2. Verify expected output:
   - if created: `src/content/investigations/<TICKET-ID>/index.mdx` exists
   - if skipped: final TLDR explains existing/duplicate/blocker
   - final response contains `## TLDR`
3. Optionally run a targeted MDX compile for new docs, then run `npm run build` once at the end when feasible.
4. Write `/tmp/investigatr-batch-<timestamp>/aggregate.md` containing every worker TLDR.
5. Report to the user with: created docs, skipped docs, duplicate mappings, build status, blockers, and the aggregate path.
6. Do not include terminal multiplexer monitor or capture instructions; batch workers must run through `@tintinweb/pi-subagents`.

Do not silently continue to a new timeframe or unrelated ticket batch after completing the requested inventory. Ask before expanding scope.
