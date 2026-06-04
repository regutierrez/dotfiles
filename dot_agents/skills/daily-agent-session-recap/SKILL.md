---
name: daily-agent-session-recap
description: Builds an Obsidian daily recap from local Pi, Claude, and Cursor agent sessions active on a given day. Use when asked to summarize today's agent/chat sessions, collect AI coding sessions, create a daily session TLDR, or attach agent-session notes to Akkio dailies. Produces compact session digests, related-session clusters, frontmatter tags, and a daily note backlink.
compatibility: macOS/Linux with python3 and sqlite3 stdlib. Designed for /Users/pakkio/Documents/pael-notes/akkio and local Pi/Claude/Cursor session stores.
---

# Daily Agent Session Recap

Create a concise Obsidian recap of local Pi, Claude, and Cursor sessions active on a date.

## Scope

Use this skill to:

- Collect sessions active on the local day from Pi, Claude, and Cursor.
- Exclude sessions with fewer than 2 substantive user prompts.
- Compact each qualifying session before writing summaries.
- Write one Markdown recap into the Akkio Obsidian vault.
- Attach that recap to the matching daily note via a wiki link.

Do not dump raw transcripts into Obsidian. Final notes contain summaries only.

## Paths

- Vault: `/Users/pakkio/Documents/pael-notes/akkio`
- Recap folder: `workflow/agent-session-recaps/`
- Recap note: `workflow/agent-session-recaps/YYYY-MM-DD-agent-session-recap.md`
- Daily note: `dailies/YYYY-MM-DD.md`
- Daily link: `[[workflow/agent-session-recaps/YYYY-MM-DD-agent-session-recap]]`

## Workflow

1. Determine the local date.
   - Default: `date +%F` from the shell, not the model clock.
   - If the user gives a date, use that `YYYY-MM-DD`.
2. Run the collector script from this skill directory:

   ```bash
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
6. Write or overwrite the recap note idempotently.
7. Create the daily note if missing; otherwise minimally update it.
8. Add the recap wiki link under `## Devlog`, avoiding duplicates.

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
type: agent-session-recap
date: YYYY-MM-DD
tags:
  - type/log
  - area/dev-tooling
  - tech/claude-code
  - status/active
agents:
  - pi
  - claude
  - cursor
---
```

Tag rules:

- Always include `type/log`, `area/dev-tooling`, `tech/claude-code`, `status/active`.
- Add inferred topical tags only when obvious from compact digests.
- Prefer existing vault taxonomy: `area/*`, `tech/*`, `client/*`, `status/*`, `type/*`.
- Do not invent low-confidence tags.

Body template:

```md
# Agent Session Recap - YYYY-MM-DD

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

If `dailies/YYYY-MM-DD.md` exists:

- Add `- [[workflow/agent-session-recaps/YYYY-MM-DD-agent-session-recap]]` under `## Devlog`.
- If the link already exists, do nothing.
- Avoid rewriting unrelated daily content.

If the daily note is missing, create:

```md
---
title: Weekday, D Mon YYYY
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: daily
tags:
  - type/daily
---

## Devlog
- [[workflow/agent-session-recaps/YYYY-MM-DD-agent-session-recap]]
```

## Empty result

If the collector returns no qualifying sessions, report that no active sessions with 2+ substantive user prompts were found. Do not create or attach a recap unless the user explicitly asks for an empty note.
