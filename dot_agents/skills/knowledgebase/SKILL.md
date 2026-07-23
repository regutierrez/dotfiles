---
name: knowledgebase
description: Captures durable information from the current agent conversation into Pael's Obsidian vault, with search, transcript, weekly-review, and maintenance modes.
argument-hint: "[capture|search|transcript|weekly-review|maintenance] [topic or date]"
compatibility: Requires local access to /Users/pakkio/Documents/pael-notes and basic file search and editing tools.
disable-model-invocation: true
---

# Knowledgebase

Operate `/Users/pakkio/Documents/pael-notes` as a curated knowledge base. Treat the conversation as source material, not automatically as canonical truth.

## Modes

Infer the mode from the request or first argument:

- `capture` (default): capture important material from the current conversation and safely update the vault.
- `search`: retrieve the current understanding of a topic without editing notes.
- `transcript`: turn a supplied meeting transcript into a terse daily digest and selective durable notes.
- `weekly-review`: review the seven most recent capture notes and propose a small promotion set.
- `maintenance`: audit note health and propose repairs without applying broad changes.

`review-only` is a modifier for any writing mode: show the proposed note operations but do not edit. If the request is just “use the knowledgebase skill,” use `capture`.

Ready-to-reuse requests for these modes live in [PROMPTS.md](PROMPTS.md). Read that file when the user asks for recurring prompts or needs help invoking a branch; it is not required for a normal capture.

## Non-negotiable contract

Before any vault read or write, read `/Users/pakkio/Documents/pael-notes/AGENTS.md`. Its retrieval order, authority rules, metadata model, and editing rules override this skill. For Akkio material, also read `akkio/00-index.md` and `akkio/README.md` before changing work-note conventions.

- Search before creating. Update the note that already owns a topic instead of creating a competing note.
- Do not copy the whole conversation. Preserve synthesized understanding, exact evidence, and useful provenance.
- Do not infer decisions, owners, dates, deadlines, root causes, verification, or technical facts the conversation does not support. Label reported or unresolved claims explicitly.
- Never write credentials, secrets, customer PII, restricted personnel information, or material prohibited from personal storage. Follow the vault's data-boundary rules.
- Preserve exact ticket and PR numbers, commit hashes, session IDs, paths, commands, error messages, and URLs when they matter. Never abbreviate an identifier needed for retrieval.
- Do not rewrite historical daily notes or raw sources for style. Do not delete, rename, bulk-move, or broadly reorganize notes without explicit approval.
- Repositories, tickets, PRs, runbooks, and official docs remain authoritative for shared work facts. Vault notes explain, connect, and point to them.

## Capture workflow

### 1. Extract durable candidates

Review the current conversation and identify only information that is one or more of:

- expensive to rediscover;
- a consequential decision or constraint;
- a reusable learning;
- a difficult root cause, fix, or diagnostic path;
- ongoing project or area context; or
- a system explanation likely to be needed again.

For each candidate, determine its type, work/personal scope, evidence, confidence, exact identifiers, and likely owner note. Skip routine progress, transient plans, generic advice, raw back-and-forth, and facts already captured correctly. If nothing clears the threshold, make no edits and say so.

### 2. Find the canonical owner

Follow the vault retrieval order: relevant maps, current durable notes, recent capture, then raw sources or archive only when necessary. Search titles, aliases, wikilinks, exact identifiers, errors, and distinctive phrases before reading large files.

Choose exactly one operation per candidate:

1. update an existing canonical note;
2. keep it only in the dated capture;
3. create one durable note from the relevant template; or
4. skip it as low-value, unsupported, or duplicate.

Do not silently overwrite a current note with a contradictory conversation claim. Preserve the contradiction or proposal with its actual confidence and report it.

### 3. Add a terse dated capture

Use the local shell date unless the user specified the session date. Open `00 Capture/YYYY-MM-DD.md`; if absent, create it from `_templates/daily.md`. Append under `## Work`, `## Personal`, or `## Learned or decided` without restructuring unrelated content.

Use only applicable lines:

```md
### Agent session — Descriptive topic
- **Outcome:** What changed or became understood.
- **Decision:** The explicit decision and key constraint.
- **Fix:** Symptom → root cause → verified fix.
- **Learned:** The reusable idea in one sentence.
- **Open:** A real unresolved question or follow-up.
- **Promoted:** [[Canonical note]]
- **Source:** [Agent conversation](session URL), captured YYYY-MM-DD
```

Omit empty labels. Keep it short enough to scan. Include the session URL or full session ID only when available; never invent one.

### 4. Promote selectively

Read the relevant file in `_templates/` before creating a durable note. Prefer these destinations while respecting nearer existing conventions:

| Material | Normal destination |
|---|---|
| Personal or cross-domain project | `10 Projects/` |
| Ongoing personal area | `20 Areas/` |
| Reusable personal, technical, or cross-domain learning | `30 Knowledge/` |
| Akkio decision | `akkio/decisions/` |
| Akkio root cause or fix | `akkio/fixes/` |
| Existing Akkio project or system knowledge | Its existing owner under `akkio/` |
| Raw transcript or source retained by explicit request | `40 Sources/`, with `type: source` and `status: raw` |

For non-work decisions and fixes, place the note beside the nearest owning project, area, or knowledge convention; do not invent a new folder for one note.

Every new durable note must:

- use the vault's core frontmatter and the appropriate template;
- have a descriptive filename and one-sentence opening summary;
- separate evidence from inference and unknowns;
- link exact authoritative artifacts when available;
- include a `## Provenance` or template-appropriate source entry naming the agent conversation, capture date, and session URL/ID when available; and
- gain at least one meaningful incoming wikilink from the dated capture and the relevant project, system, domain index, or map.

When updating a canonical note, preserve useful existing material and provenance, update only the sections the conversation actually changes, and set `updated` to the capture date.

### 5. Validate and report

Re-read every modified note. Confirm that frontmatter is valid YAML, new wikilinks resolve, no duplicate title or alias was introduced, exact identifiers survived, and unsupported claims were not promoted as fact.

Report:

- notes created;
- notes updated;
- candidates kept only in capture or skipped, with a short reason;
- unresolved contradictions or claims needing authoritative verification.

## Search mode

Search read-only using the vault's retrieval order. Prefer current durable notes and explicitly distinguish:

1. current synthesized understanding;
2. supporting daily/source evidence;
3. unresolved contradictions or stale material; and
4. authoritative external artifacts that still need verification.

Cite the note paths or wikilinks used. Do not edit merely because search exposes an issue; offer a maintenance or capture action separately.

## Transcript mode

Treat a transcript as raw evidence. Extract outcomes, explicit decisions, commitments, open questions, reusable learnings, and exact references. Distinguish decisions from suggestions; record owners and deadlines only when explicit.

By default, write only a terse digest to the dated capture and promote qualifying items through the normal capture workflow. Leave the raw transcript in its source application. Copy it to `40 Sources/` only when the user explicitly asks to retain it in the vault.

## Weekly-review mode

Read the seven most recent notes in `00 Capture/` (or the requested range), then search for existing canonical owners. Return no more than five high-value promotion or merge candidates, with destination, operation, value, and proposed incoming link. This branch is proposal-only unless the user explicitly asks to apply the candidates.

## Maintenance mode

Audit only the requested scope for isolated current notes, duplicate canonical notes, unresolved links, stale drafts, and superseded notes whose replacement is unclear. Return evidence and the smallest proposed action for each finding. Do not mutate, archive, delete, rename, or bulk-link notes until the user approves the proposal.
