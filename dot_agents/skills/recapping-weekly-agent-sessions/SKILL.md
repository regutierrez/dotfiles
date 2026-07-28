---
name: recapping-weekly-agent-sessions
description: Builds a raw weekly Obsidian recap from local Pi, Claude, and Cursor sessions. Use for a weekly agent-session review, Sunday work recap, missed-capture check, or session inventory.
argument-hint: "[YYYY-Www | YYYY-MM-DD to YYYY-MM-DD]"
compatibility: Requires Python 3 with sqlite3, local access to supported session stores, and read/write access to the Obsidian vault. Works with any harness that can run shell commands and edit files.
---

# Weekly Agent Session Recap

Create one raw weekly source that records important agent work, retains full session IDs, and identifies durable material that may have escaped daily capture.

## Responsibilities

This skill:

- collects local Pi, Claude, and Cursor sessions once over a date range;
- excludes sessions with fewer than two substantive user prompts;
- summarizes the week by workstream and outcome;
- checks whether important outcomes already appear in daily or durable notes;
- writes one raw source recap; and
- adds one terse link to the daily note on which the review runs.

This skill does not create or update durable notes. The `knowledgebase` skill owns promotion decisions and should consider the recap's `Possible capture gaps` during its weekly review.

## Portability

Keep scheduling outside this skill. Any harness may invoke it manually or on a schedule as long as its executor can access the local home directory and vault.

- Do not depend on Amp-only tools, thread metadata, or scheduling APIs.
- Resolve `scripts/collect_sessions.py` relative to this `SKILL.md`, not the caller's working directory.
- Use shell commands and normal file reads/edits that Pi, Claude, Cursor, Amp, and similar harnesses can perform.
- Subagents are optional for large weeks; never require a harness to support them.
- For Amp scheduling, use an Amp Runner on this machine, not an orb. An orb cannot see these local session stores or the vault.

Suggested schedule request:

```text
Use the recapping-weekly-agent-sessions skill to prepare the weekly agent-session recap for the week ending today. Follow the skill's default Sunday period, write the raw source, and add one link to today's capture. Do not promote durable notes.
```

Schedule it late enough on Sunday to include that day's work.

## Paths

Resolve the vault in this order:

1. `$PAEL_NOTES_VAULT` when set;
2. `/Users/pakkio/Documents/pael-notes` as the local default; or
3. an explicit vault path supplied by the user.

Within the vault:

- recap folder: `40 Sources/Agent Session Recaps/`;
- standard recap name: `YYYY-wWW-agent-session-recap.md`;
- review-day capture: `00 Capture/YYYY-MM-DD.md`.

Leave historical daily recaps under `40 Sources/Akkio/Agent Session Recaps/` unchanged.

Before reading or writing the vault, read its `AGENTS.md`. For Akkio material, also read `akkio/00-index.md` and `akkio/README.md`. Current vault instructions override this skill.

## Period selection

Use local dates from the executor:

- On Sunday with no explicit period, collect the Monday-Sunday week ending that day.
- On Monday-Saturday with no explicit period, collect the previous complete Monday-Sunday week.
- `--week YYYY-Www` selects an ISO week.
- `--start-date YYYY-MM-DD --end-date YYYY-MM-DD` selects an inclusive custom range.
- `--date YYYY-MM-DD` remains available for one-day compatibility.

The collector implements these defaults, so scheduled and manual invocations behave the same across harnesses.

## Data boundary

Session stores can contain sensitive prompts and outputs. Treat collector JSON as temporary sensitive material:

- Set `umask 077` before creating it.
- Never copy raw prompts, raw assistant output, credentials, tokens, API keys, environment values, customer PII, restricted personnel information, or other prohibited material into the vault.
- Preserve exact ticket IDs, PRs, commits, session IDs, and non-sensitive paths only when useful for retrieval.
- If sensitive detail is essential context, summarize the outcome without the detail and write `sensitive details omitted`.
- Delete the temporary JSON after success or after any failure that can be cleaned up.

## Workflow

### 1. Collect the period once

Resolve the directory containing this file as `SKILL_DIR`, then run:

```bash
umask 077
python3 "$SKILL_DIR/scripts/collect_sessions.py" --pretty > "${TMPDIR:-/tmp}/weekly-agent-sessions.json"
```

For an explicit week:

```bash
python3 "$SKILL_DIR/scripts/collect_sessions.py" \
  --week 2026-W31 \
  --pretty > "${TMPDIR:-/tmp}/weekly-agent-sessions.json"
```

Do not loop over seven single dates. The range collector emits each session once and limits timestamped Pi and Claude transcript messages to the selected period.

Use `--deep-scan` only when normal collection appears incomplete. It can be much slower because it disables the file-time prefilter.

### 2. Build compact session digests

For every `sessions[]` item, record only:

- goal or task;
- outcome and status at the end of the period;
- explicit decisions and verified fixes;
- unresolved follow-ups that remained open after later sessions;
- ticket, PR, commit, and other useful identifiers;
- files or repositories touched when clear; and
- explicit concepts that connect it to another session.

Use only these compact digests when writing the recap. Never paste transcript text.

If subagents digest a large week, reconcile their returned IDs against the collector's authoritative `sessions[].id` set. Require exactly one digest per collected session: no missing, invented, shortened, or duplicated IDs.

### 3. Check what the vault already captured

Follow the vault's retrieval order. Search daily notes within the period, then current durable notes, using full session IDs, ticket IDs, PRs, commits, and distinctive outcomes.

Classify durable-looking material as one of:

1. already captured correctly — link the daily or durable note from its workstream;
2. possible capture gap — list it under `Possible capture gaps`; or
3. routine, transient, unsupported, or duplicate — leave it only in the session index.

List at most five possible capture gaps. They are review candidates, not facts to promote automatically.

### 4. Write the weekly raw source

For a normal ISO week, lowercase the collector's label for the filename:

```text
40 Sources/Agent Session Recaps/2026-w31-agent-session-recap.md
```

For a custom range that is not exactly Monday-Sunday, use:

```text
40 Sources/Agent Session Recaps/2026-07-28-to-2026-08-01-agent-session-recap.md
```

Create the folder if missing. Write or replace the matching recap idempotently.

Use this frontmatter:

```yaml
---
title: Agent session recap — 2026-W31
type: source
scope: mixed
status: raw
created: YYYY-MM-DD
updated: YYYY-MM-DD
period_start: YYYY-MM-DD
period_end: YYYY-MM-DD
aliases: []
tags:
  - type/source
---
```

On rerun, preserve `created` and set `updated` to the run date. Do not add inferred topical tags or an `agents` list.

Use this body:

```md
> Raw summary of local agent sessions from YYYY-MM-DD through YYYY-MM-DD. Follow linked current notes for authoritative understanding.

## Week at a glance

- Three to five important outcomes or themes. Prefer what changed over activity counts.

## Workstreams

### Topic, project, or ticket

- **Outcome:** What changed or became understood.
- **Status at week end:** Finished, ongoing, blocked, or unclear.
- **Sessions:** `full-session-id`, `full-session-id`
- **Captured in:** [[daily or durable note]]

## Possible capture gaps

- At most five decisions, fixes, learnings, or project changes with no matching current note. Omit this section when there are none.

## Still open at week end

- Follow-ups that remained unresolved after considering later sessions. Omit this section when there are none.

## Session index

| Date | Session | Agent | Directory | Summary |
|---|---|---|---|---|
| YYYY-MM-DD | `full-session-id` | pi | `/path` | One-line outcome. |

## Collection limitations

- Cursor sessions are dated by creation time because their store has no trustworthy per-message or continuation timestamps.
- Sensitive details were omitted.
```

Workstream grouping may use only shared ticket or issue IDs, or explicit concepts and entities from compact digests. Do not group sessions merely because they share a directory.

Use the full `sessions[].id` everywhere. Never shorten an ID needed to find or resume a session.

### 5. Add one review-day capture link

Use the local run date, not `period_end`. Open `00 Capture/YYYY-MM-DD.md`; create it from `_templates/daily.md` if missing. Under `## Work`, add or replace one idempotent block:

```md
### Weekly agent-session review — 2026-W31
- **Outcome:** Reviewed N sessions across N workstreams; found N possible capture gaps.
- **Source:** [[40 Sources/Agent Session Recaps/2026-w31-agent-session-recap|weekly agent-session recap]]
```

Do not attach the recap to every daily note in the period. Do not rewrite unrelated capture content.

### 6. Clean up and report

Delete the temporary JSON. Report:

- period reviewed;
- recap path;
- number of sessions and workstreams;
- number of possible capture gaps;
- review-day capture path; and
- collection limitations that materially affected the result.

## Collector output contract

The collector emits:

```json
{
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "iso_week": "YYYY-Www or null",
  "generated_at": "...",
  "sessions": [
    {
      "id": "...",
      "agent": "pi|claude|cursor",
      "directory": "/path/or/null",
      "created_at": "...",
      "first_activity_at": "...",
      "last_activity_at": "...",
      "active_dates": ["YYYY-MM-DD"],
      "user_turns": 3,
      "assistant_turns": 5,
      "title": "optional",
      "source_paths": ["..."],
      "truncated": false,
      "transcript": [
        {"role": "user", "timestamp": "optional", "text": "..."},
        {"role": "assistant", "timestamp": "optional", "text": "..."}
      ]
    }
  ]
}
```

Cursor's `active_dates` contains only its creation date. This limitation is accepted; do not infer continuation dates from database file modification times.

## Empty result

If there are no qualifying sessions, report that result and the period checked. Do not create a recap or review-day capture entry unless the user explicitly asks for an empty record.
