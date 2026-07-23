---
name: daily-agent-session-recap
description: Builds a raw Obsidian source recap from local Pi, Claude, and Cursor sessions active on a given day. Use when asked to summarize today's agent/chat sessions, collect AI coding sessions, or create a daily session TLDR. Produces compact session digests under 40 Sources and adds a terse link to universal daily capture.
compatibility: macOS/Linux with python3 and sqlite3 stdlib. Designed for /Users/pakkio/Documents/pael-notes and local Pi/Claude/Cursor session stores.
disable-model-invocation: true
---

# Daily Agent Session Recap

Create a concise Obsidian recap of local Pi, Claude, and Cursor sessions active on a date.

## Scope

Use this skill to:

- Collect sessions active on the local day from Pi, Claude, and Cursor.
- Exclude sessions with fewer than 2 substantive user prompts.
- Compact each qualifying session before writing summaries.
- Write one raw source recap into the Obsidian vault.
- Attach that source tersely to the matching universal daily capture note.

Do not dump raw transcripts into Obsidian. Final notes contain summaries only and are evidence, not canonical current knowledge. Do not promote or update durable notes; use the `knowledgebase` skill separately when a session contains a decision, fix, learning, project update, or system explanation worth preserving.

## Paths

- Vault: `/Users/pakkio/Documents/pael-notes`
- Recap folder: `40 Sources/Akkio/Agent Session Recaps/`
- Recap note: `40 Sources/Akkio/Agent Session Recaps/YYYY-MM-DD-agent-session-recap.md`
- Daily note: `00 Capture/YYYY-MM-DD.md`
- Daily link: `[[40 Sources/Akkio/Agent Session Recaps/YYYY-MM-DD-agent-session-recap|Agent session recap]]`

Before reading or writing the vault, read `/Users/pakkio/Documents/pael-notes/AGENTS.md`. For Akkio material, also read `akkio/00-index.md` and `akkio/README.md`. Their current conventions override this skill.

## Data boundary

Session stores can contain sensitive prompts and outputs. Treat collector JSON as temporary sensitive material:

- Set `umask 077` before creating the temporary JSON file.
- Never copy raw prompts, raw assistant output, credentials, tokens, API keys, environment values, customer PII, restricted personnel information, or other prohibited material into the vault.
- Preserve exact ticket IDs, PRs, commits, session IDs, and non-sensitive paths only when useful for retrieval.
- If sensitive detail is essential context, summarize the outcome without the detail and say `sensitive details omitted`.
- Delete the temporary JSON after the recap is written or after any failure you can clean up.

## Workflow

1. Determine the local date.
   - Default: `date +%F` from the shell, not the model clock.
   - If the user gives a date, use that `YYYY-MM-DD`.
2. Run the collector script from this skill directory:

   ```bash
   umask 077
   python3 scripts/collect_sessions.py --date YYYY-MM-DD --pretty > /tmp/agent-sessions-YYYY-MM-DD.json
   ```

   For historical dates or suspected missed sessions, add `--deep-scan`; it is slower but does not prefilter by file mtime.

3. Read the normalized JSON.
4. For each `sessions[]` item, create a transient compact digest:
   - goal/task
   - key context
   - decisions made
   - files/repos touched when clear
   - outcome/current state
   - open loops/TODOs
   - ticket/issue IDs
   - explicit concepts/entities
   - likely Obsidian tags
5. Use only compact digests to write the final recap Markdown.
6. Create the recap folder if missing, then write or overwrite the recap note idempotently.
7. Create the daily note from `_templates/daily.md` if missing; otherwise minimally update it.
8. Add a terse recap link under `## Work`, avoiding duplicates.
9. Remove `/tmp/agent-sessions-YYYY-MM-DD.json`.

## Collector output contract

The collector emits normalized JSON shaped like:

```json
{
  "date": "YYYY-MM-DD",
  "generated_at": "...",
  "sessions": [
    {
      "id": "...",
      "agent": "pi|claude|cursor",
      "source": "...",
      "directory": "/path/or/null",
      "created_at": "...",
      "last_activity_at": "...",
      "user_turns": 3,
      "assistant_turns": 5,
      "title": "optional",
      "source_paths": ["..."],
      "truncated": false,
      "transcript": [
        {"role": "user", "text": "..."},
        {"role": "assistant", "text": "..."}
      ]
    }
  ]
}
```

If transcript context is insufficient, rerun with a larger cap:

```bash
python3 scripts/collect_sessions.py --date YYYY-MM-DD --max-session-chars 60000 --pretty > /tmp/agent-sessions-YYYY-MM-DD.json
```

## Recap Markdown format

Use this frontmatter schema:

```yaml
---
title: Agent Session Recap - YYYY-MM-DD
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: source
scope: work
status: raw
aliases: []
date: YYYY-MM-DD
tags:
  - type/source
agents:
  - pi
  - claude
  - cursor
---
```

Tag rules:

- Always include only `type/source`.
- Add inferred topical tags only when obvious from compact digests.
- Prefer existing vault taxonomy: `area/*`, `tech/*`, `client/*`, `status/*`, `type/*`.
- Do not invent low-confidence tags.

Body template:

```md
## TLDR
- Terse all-sessions summary.
- Include cross-session themes and related work.

## Related Sessions
- **Topic / ticket / concept**: session ids and one-line relationship.

## Sessions
| Session | Agent | Directory | TLDR |
|---|---|---|---|
| `full-session-id-uuid` | pi | `/path` | One terse summary. |

## Open Loops
- TODOs or unresolved follow-ups only.
```

Session ID rule:

- In both the `## Sessions` table and `## Related Sessions`, reference each session by its **full `id` value** from the collector JSON (e.g. `c38287a4-8857-4259-9785-2293b690a1aa`), wrapped in backticks.
- Do NOT shorten, truncate, or abbreviate the id (no 8-char prefixes). The full UUID is needed to resume/locate the session.

Related-session grouping must use only:

- shared ticket/issue IDs
- shared explicit concepts/entities from compact digests

Do not group merely by directory/worktree.

## Daily note update

If `00 Capture/YYYY-MM-DD.md` exists:

- Add `- **Agent sessions:** [[40 Sources/Akkio/Agent Session Recaps/YYYY-MM-DD-agent-session-recap|recap]]` under `## Work`.
- If the link already exists, do nothing.
- Avoid rewriting unrelated daily content.

If the daily note is missing, read `_templates/daily.md` and create the note from it. The expected shape is:

```md
---
title: "YYYY-MM-DD"
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: daily
scope: mixed
status: current
aliases: []
tags:
  - type/daily
---

## Focus

## Work

- **Agent sessions:** [[40 Sources/Akkio/Agent Session Recaps/YYYY-MM-DD-agent-session-recap|recap]]

## Personal

## Learned or decided
```

## Empty result

If the collector returns no qualifying sessions, report that no active sessions with 2+ substantive user prompts were found. Do not create or attach a recap unless the user explicitly asks for an empty note.
