---
name: investigatr-authoring
description: Author deep investigation writeups for the Investigatr Astro site. Use when given a Linear ticket/URL/ID and asked to investigate, document findings, add screenshots/videos, or update investigation MDX; always writes into /Users/pakkio/playground/investigatr, even when invoked from another repository or global skill location.
---

# Investigatr Authoring

Global skill for writing evidence-backed investigation MDX. Target repo is always `/Users/pakkio/playground/investigatr`; use absolute paths or `cd` there before file edits, tests, or content creation. Application code lives in `~/Akkio/`.

## Required CLIs

- Use `linear-cli` for all Linear reads. Do not use Linear MCP tools when `linear-cli` is available.
- Use `pup` for all Datadog reads. Do not use Datadog MCP tools when `pup` is available.
- Prefer `--output json --compact --fields ...` for `linear-cli` and `--output=json --limit=N` for `pup`; parse with `jq`, `uv`, or small scripts instead of eyeballing large output.
- If either CLI returns an auth/config error, stop and report the missing access. Do not start interactive auth flows (`linear-cli auth`, `pup auth login`) unless the user explicitly asks.

## Goal / Success Criteria

A successful investigation lets an engineer understand what happened, why it happened or what remains unknown, who/what was affected, how to reproduce or validate it, and where to inspect or fix next. Every major claim must be backed by Linear, Datadog, code, or production data evidence.

## Investigation Workflow

1. **Resolve Linear ticket with `linear-cli`.** Use machine-readable output and narrow fields when possible:
   - `linear-cli issues get <TICKET-ID> --output json --compact` for title, body, metadata, labels, team/project, dates, URL, assignee, creator/reporter.
   - `linear-cli comments list <TICKET-ID> --output json --compact --all` for discussion, updates, logs, repro notes, impact, links, screenshots, attachments.
   - `linear-cli attachments list <TICKET-ID> --output json --compact --all` and `linear-cli uploads ...` for linked docs/images/attachments when useful.
   - `linear-cli api --output json` only when typed subcommands do not expose a needed field.
2. **Extract anchors.** Collect searchable IDs/terms: user email/ID, org/customer, project/resource/deployment IDs, trace IDs, request paths, service/env, timestamps, error text, feature names, affected entity IDs.
3. **Investigate Datadog deeply with `pup`.** Search logs/spans around the reported time, then widen. Start with aggregates, then fetch small representative samples:
   - `pup logs aggregate --query='<scoped query>' --from=<range> --compute=count --group-by=<field> --limit=20 --output=json`
   - `pup logs search --query='<scoped query>' --from=<range> --to=<range> --limit=20 --output=json`
   - `pup traces search --query='trace_id:<trace_id>' --from=<range> --output=json`
   - Add `pup rum`, `pup events`, `pup metrics`, `pup monitors`, or `pup incidents` queries when relevant.
   If no trace ID exists, discover candidates from strongest anchors and inspect only traces connected to the reported action/resource. Capture scoped Datadog URLs.
4. **Correlate evidence.** Build an ET timeline from Linear + Datadog + code/data. Mark `Unknown`, assumptions, and hypotheses explicitly.
5. **Verify root cause before claiming it.** Confirm production entity IDs, persisted fields/state, user-authored input/config, read/write code paths, start time, frequency, blast radius, recurrence, and ruled-out hypotheses. Do not say `likely bad data` unless the data was directly inspected.
6. **Reproduce or document limits.** Every investigation needs `## Reproduction steps`. Use exact browser/API/CLI steps, prerequisites, expected visible result/error, and screenshots/video when the user asks to reproduce. If unsafe or impossible, provide the closest safe partial repro and explain exactly what prevents full reproduction. Use `chrome-devtools-cli` when asked to reproduce; Chrome MCP is fallback.
7. **Explain for newcomers.** Define codebase-specific services, queues, cron jobs, integrations, tables, features, and acronyms in plain language.
8. **Write and validate MDX.** Keep under 200 lines when possible. Run `npm run build` after content changes when feasible. If access to Linear/Datadog/data/code is missing, state exactly what is unavailable instead of guessing.

## Extra Depth Requirements

For production incidents:

- Find first-seen time and count occurrences by hour/day.
- Compare before/after suspected deploys.
- Capture representative logs containing the actual problematic fields.
- Avoid unrelated request traces as representative evidence.

When behavior starts suddenly:

- Find deployed service versions around first seen.
- Map SHAs to commits/PRs and compare relevant code.
- Decide whether code, data, upstream behavior, branch/release, or migration context changed.

For audience/customer-match issues:

- Distinguish project name, audience name, audience ID, and distribution group ID.
- Recover actual `audienceSql`; do not rely on `Audiences SQL:` logs if they are materialization/cache SQL.
- Inspect `audience.sources`, `distribution_invalidity`, and source table metadata.
- For `dv360_only_1p`, inspect `ml/src/audience/distribution/validators/dv360_only_1p.py`, `ml/src/audience/tasks.py`, and frontend invalidity copy.
- Determine whether non-client tables are used for membership/filtering, projection/labeling, or identity resolution/key translation.
- Do not recommend retagging a table as `client` unless the table is truly first-party.

## Content Location

Create one folder per investigation:

```text
/Users/pakkio/playground/investigatr/src/content/investigations/<TICKET-ID>/
├── index.mdx
└── assets/
```

Use the canonical Linear ticket ID. Store screenshots/recordings/media in `assets/` and reference them as `./assets/file.png`.

## Frontmatter

Match `/Users/pakkio/playground/investigatr/src/content.config.ts`:

```yaml
---
ticket_id: AKKIO-12345
title: Clear factual title
tags:
  - chat review
  - data_issue
created_at: 2026-05-01
updated_at: 2026-05-01
linear_url: https://linear.app/...
---
```

Tags must include

- one ticket type -- `chat_review` if linear ticket content contains "Chat Review", otherwise `service_now`
- one or more issue types, such as `test`, `no_description`, `no_bug`, `auth_access_issue`, `loading_rendering_issue`, `incorrect_sql`, `inefficient_sql`, `data_issue`, `infra_error`, `chat_response_issue`, `user_issue`, `chart_visualization_issue`, `ui_ux_issue`, `feature_request`, or `uncategorized`.

## Required MDX Structure

Start with:

```md
# AKKIO-12345 — Short factual title

> Reporter: Name (email), Customer/Org if known
> Project: Project/resource URL if known
> User Feedback (if chat review)
> Triaged description (if chat review)
```

Then add `## Summary`. Include only rows supported by evidence:

| Field                           | Value                                                   |
| ------------------------------- | ------------------------------------------------------- |
| Trace ID (representative)       | `...`                                                   |
| Other relevant traces           | `...`                                                   |
| User                            | Name — uid `...` (email)                                |
| Org / customer                  | `...`                                                   |
| Project / resource ID           | `...`                                                   |
| Affected entity IDs             | `...`                                                   |
| Service(s)                      | `api`, `worker`, `frontend`                             |
| Environment                     | `production`, `staging`, etc.                           |
| Build / version                 | commit SHA or release if known                          |
| First seen / reproduced at (ET) | timestamp range                                         |
| Frequency / blast radius        | one user, one org, all deploys matching condition, etc. |
| User-visible symptom            | exact symptom from ticket/UI                            |
| Error / exception               | exact error text                                        |
| Downstream dependency           | external service/API if relevant                        |
| App area                        | e.g. Audience builder → Chat                            |
| Datadog — logs                  | scoped URL                                              |
| Datadog — trace                 | URL                                                     |
| Datadog — metrics/RUM/events    | scoped URL                                              |

After `## Summary`, include:

- `## TLDR` — 2–5 beginner-friendly bullets that state what the issue is.
- `## Timeline (ET)` — numbered user action → backend/worker/downstream → symptom.
- `## Root cause` — concise causal explanation with code/log/data references, or `Unknown` plus the remaining evidence gap.
- `## Reproduction steps` — exact reproducible steps. If full reproduction is impossible, include a safe partial repro and explain exactly what prevents full reproduction. Attach the assets in the .mdx file.
- `## Validation steps` — concrete checks to confirm finding/fix, e.g. Postgres, Snowflake, Firestore, UI checks.
- `## Other potential causes considered (and ruled out)` — each hypothesis and evidence against it.

Optional when useful:

- `## Data flow` — Mermaid or ASCII diagram.
- `## Suggested fix sketch` — scoped fixes ranked by correctness/effort.
- `## Relevant files` — code paths and line ranges.
- `## Glossary` — customer/domain terms.

## **MUST DO** Self-Review Before Finalizing

- Could a junior engineer tell where to look next?
- Are required lookup IDs included: user, org, project, resource, deployment group, trace, job, downstream IDs?
- Are customer-visible symptom, production state, user-authored input/config, and code path quoted or summarized accurately?
- Are conclusions backed by direct Linear/Datadog/code/data evidence with URLs, file references, or the exact `linear-cli`/`pup` commands used?
- Are missing facts labeled `Unknown` with the exact next query/tool needed?
- Did you avoid recommending a data fix when code semantics are wrong?
- Does the MDX include mandatory reproduction and validation steps?
- Did `npm run build` pass?

## Writing Standards

Be factual, concise, beginner-friendly, and evidence-backed. Use ET timestamps (`EST`/`EDT` when known). Include exact IDs, trace IDs, service names, URLs, and error strings. Prefer observations over commentary. Preserve uncertainty. Limit customer-sensitive detail to what engineering diagnosis requires.
