---
name: investigatr-authoring
description: Author deep investigation writeups for the Investigatr Astro site. Use when given a Linear ticket/URL/ID and asked to investigate, document findings, add screenshots/videos, or update investigation MDX; always writes into /Users/pakkio/playground/investigatr, even when invoked from another repository or global skill location.
---

# Investigatr Authoring

This skill is intended to be installed globally, not kept inside the Investigatr repository.

Always treat `/Users/pakkio/playground/investigatr` as the target project root for files and commands. If the current working directory is elsewhere, use absolute paths or `cd /Users/pakkio/playground/investigatr` before inspecting, editing, testing, or creating content.

## Required Investigation Workflow

1. **Resolve the ticket.** Use the Linear MCP to fetch the full issue from the provided ticket ID or URL.
   - Use `linear_get_issue` for the issue body, title, status, assignee, reporter/creator, labels, project, team, dates, and URL.
   - Use `linear_list_comments` for the full discussion, updates, pasted logs, repro notes, customer impact, and linked context.
   - If the ticket references attachments, images, docs, or links, fetch them with the relevant Linear MCP tools when useful.
2. **Extract investigation anchors.** From Linear, identify all available IDs and terms to search: user email, user ID, org/customer, project ID, deployment ID, trace ID, request path, service name, environment, timestamps, error text, feature name, and affected resource IDs.
   - Trace IDs may appear directly in Linear comments, pasted Datadog links, screenshots, logs, or error reports.
   - If no trace ID is given, discover it from Datadog by searching logs/spans around the reported time with the strongest anchors first: user email/ID, org ID, project/resource ID, route/path, error text, and service.
   - Treat trace IDs as evidence only when the trace/logs connect to the reported user action or affected resource. Do not put random nearby traces in the summary table.
3. **Investigate in Datadog.** Use the Datadog MCP for a deep investigation, not a shallow summary.
   - Search logs around the Linear-reported time window first, then widen if needed.
   - Use `datadog_search_datadog_logs` or `datadog_analyze_datadog_logs` for log evidence.
   - Use `datadog_get_datadog_trace` when a trace ID is known.
   - When a trace ID is not known, use log/span searches to discover candidate trace IDs, then inspect the best candidates with `datadog_get_datadog_trace`.
   - Use span, RUM, event, metric, monitor, and incident tools when relevant to connect user action → backend request → worker/job → downstream dependency → user-visible symptom.
   - Capture Datadog URLs for important searches, traces, dashboards, or logs when possible.
4. **Correlate evidence.** Build a factual timeline with Eastern Time timestamps. Prefer direct evidence from Linear + Datadog. Clearly mark unknowns, assumptions, and hypotheses.
5. **Reproduce or document why reproduction is blocked.** Reproduction steps are mandatory for every investigation. If direct reproduction is impossible because of permissions, production safety, missing data, or time, include the closest safe reproduction path plus the exact blocker.
6. **Explain for a newcomer.** Assume the reader is a junior developer who is new to the codebase. Explain codebase-specific flows, services, queues, cron jobs, integrations, and domain terms in plain language.
7. **Write the MDX.** Create or update the investigation folder in this repo and include a detailed summary table plus narrative sections. Keep the final investigation under 200 lines when possible.

## Evidence Quality Gate

Do not finalize an investigation until each conclusion is backed by direct evidence.

Before writing `Root cause`, verify:

- The exact production entity IDs involved in the symptom, not just display names or UI labels.
- The persisted production record fields that caused the behavior.
- The actual user-authored input/configuration, not only generated, materialized, cached, or internal output.
- The exact code path that reads and writes those fields.
- Whether the issue is new behavior, newly exposed old behavior, or pre-existing data.
- Aggregate scope: first seen, frequency, blast radius, affected users/orgs/resources, and recurrence pattern.

Avoid conclusions like `likely bad data` unless the data was directly inspected. If direct evidence is missing, write `Unknown` and list the exact next query/tool needed.

## Root Cause Depth

Investigations should answer:

1. What user action or background job produced the symptom?
2. What persisted field/state caused the UI/API behavior?
3. What code wrote that state?
4. What code consumed that state?
5. Why did this start now?
6. Why was it not caught before?
7. What other hypotheses were ruled out, and by what evidence?

Do not stop at the first code branch that explains the symptom. Continue until the production data and code path agree.

## Reproduction Requirement

Every investigation must include a `## Reproduction steps` section.

- Prefer exact browser/API/CLI steps that another engineer can run.
- Include prerequisites: environment, team/org selection, account/permissions, feature flags, IDs, timestamps, and URLs.
- Quote the expected visible result or error text.
- If live reproduction is unsafe or unavailable, include a safe partial reproduction and a `Blocked by` note explaining exactly what prevents full reproduction.
- Do not omit reproduction steps just because the issue is intermittent, historical, data-specific, or production-only.

## Datadog Aggregate Requirement

For production incidents, search beyond the reported timestamp:

- Find first-seen time.
- Count occurrences by day/hour.
- Compare before/after suspected deploys.
- Search for correlated log strings from the same code path.
- Capture representative logs that contain the actual problematic fields.
- Do not use unrelated request traces, such as rename traces, as representative traces for the bug unless they directly contain the failing state.

## Deploy / Version Archaeology

When behavior appears to start suddenly:

- Find deployed service versions around the first-seen time.
- Map version SHAs to git commits/PRs.
- Compare relevant code before/after.
- Check whether the code changed, the data changed, or an upstream path started working.
- Include branch, release, and storage-migration context when relevant.

## Audience / Customer Match Investigations

For audience deployment issues:

- Distinguish project name, audience name, audience ID, and distribution group ID.
- Recover the actual `audienceSql`; do not rely on `Audiences SQL:` logs if they are materialization/cache SQL.
- Inspect `audience.sources`, `distribution_invalidity`, and source table metadata.
- For `dv360_only_1p`, inspect:
  - `ml/src/audience/distribution/validators/dv360_only_1p.py`
  - source stats population in `ml/src/audience/tasks.py`
  - frontend invalidity copy in audience distribution UI files.
- Determine whether a non-client table is being used for audience membership/filtering, projection/labeling, or identity resolution/key translation.
- Do not recommend retagging a table as `client` unless the table itself is truly first-party. Some enrichment-tagged tables may be correctly tagged but incorrectly interpreted by the validator.

## Content Location

Create one folder per investigation:

```text
/Users/pakkio/playground/investigatr/src/content/investigations/<TICKET-ID>/
├── index.mdx
└── assets/
```

Use the canonical Linear ticket ID for `<TICKET-ID>`. Put screenshots, recordings, and other media for the investigation in that investigation's `assets/` directory. Reference local assets from `index.mdx` with relative paths, for example `./assets/screenshot.png`.

## MDX Frontmatter

Use frontmatter matching `/Users/pakkio/playground/investigatr/src/content.config.ts`:

```yaml
---
ticket_id: AKKIO-12345
title: Clear factual title
tags:
  - investigation
created_at: 2026-05-01
updated_at: 2026-05-01
linear_url: https://linear.app/...
---
```

## Investigation Format

Start the body with the ticket title and a Linear quote block:

```md
# AKKIO-12345 — Short factual title

> Linear: https://linear.app/...
> Reporter: Name (email), Customer/Org if known
> Project: Project/resource URL if known
```

Then include a `## Summary` table. Fill as many rows as evidence supports; omit irrelevant rows rather than inventing values. After the table, add `## TLDR` with 2–5 beginner-friendly bullets that explain what happened, why it happened, and what to do next.

| Field                            | Value                                                   |
| -------------------------------- | ------------------------------------------------------- |
| Trace ID (representative)        | `...`                                                   |
| Other relevant traces            | `...`                                                   |
| User                             | Name — uid `...` (email)                                |
| Org / customer                   | `...`                                                   |
| Project / resource ID            | `...`                                                   |
| Affected entity IDs              | `...`                                                   |
| Service(s)                       | `api`, `worker`, `frontend`                             |
| Environment                      | `production`, `staging`, etc.                           |
| Build / version                  | commit SHA or release if known                          |
| First seen / reproduced at (ET)  | timestamp range                                         |
| Frequency / blast radius         | one user, one org, all deploys matching condition, etc. |
| User-visible symptom             | exact symptom from ticket/UI                            |
| Error / exception                | exact error text                                        |
| Downstream dependency            | external service/API if relevant                        |
| Datadog — logs                   | URL or query                                            |
| Datadog — trace                  | URL                                                     |
| Datadog — metrics/RUM/events     | URL or query                                            |

After `## TLDR`, include these mandatory sections:

- `## Timeline (ET)` — numbered steps from user action through backend/worker/downstream effects.
- `## Root cause` — concise causal explanation with code/log references when available. If root cause is not confirmed, state `Unknown` and list the remaining evidence gap.
- `## Reproduction steps` — exact browser/API/CLI steps another engineer can run. If full reproduction is blocked, include the safest partial reproduction and a `Blocked by` note.
- `## Validation steps` — concrete checks another engineer can run to confirm the finding or fix.
- `## Other potential causes considered (and ruled out)` — include why each was ruled out.

Then include these optional sections when useful:

- `## Data flow` — Mermaid or fenced ASCII diagram for multi-service flows.
- `## Suggested fix sketch` — actionable, scoped fix ideas ranked by correctness and effort when multiple fixes exist.
- `## Relevant files` — code paths and line ranges if known. Fixes can also be changes in context.
- `## Glossary` — short explanations for customer/domain terms when useful.

## Final Self-Review Checklist

Before finalizing:

- Would a junior engineer know exactly where to look next?
- Are all relevant IDs included: user, org, project, resource, deployment group, trace, job, and downstream IDs?
- Is the actual customer-visible symptom quoted?
- Is the actual production state quoted?
- Is the actual user-authored input/configuration quoted or summarized accurately?
- Is the actual code path quoted with file references?
- Are proposed fixes ranked by correctness and effort when there is more than one option?
- Did you avoid recommending a data fix when the code semantics are wrong?
- Does the MDX include mandatory `## Reproduction steps`?

## Writing Standards

- Be factual and evidence-backed. Do not overstate confidence.
- Keep the investigation under 200 lines when possible. If evidence is large, summarize it and link/query the source instead of pasting everything.
- Use beginner-friendly wording. Assume the reader is a junior dev new to this codebase.
- Explain hard concepts with an ELI5 sentence before using the technical term. Example: `A queue is a waiting line for background work; here, Celery runs the queued deploy job.`
- Define codebase-specific services, tables, jobs, feature names, and acronyms the first time they appear.
- Use Eastern Time for timelines unless the source requires another timezone. Label timestamps as `ET` and include `EST` or `EDT` when known.
- Include exact IDs, trace IDs, service names, URLs, and error strings.
- Prefer concrete observations over generic commentary.
- Preserve uncertainty with phrases like `Unknown`, `Not found in Datadog`, or `Likely` only when supported.
- Keep customer-sensitive details limited to what is necessary for engineering diagnosis.
