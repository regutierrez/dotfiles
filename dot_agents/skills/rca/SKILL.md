---
name: rca
description: Author deep investigation writeups for the Investigatr Astro site. Use when given a Linear ticket/URL/ID and asked to investigate, document findings, add screenshots/videos, or update investigation MDX; always writes into /Users/pakkio/playground/investigatr, even when invoked from another repository or global skill location.
disable-model-invocation: true
---

# Investigatr Authoring

Global skill for writing evidence-backed investigation MDX. Target repo is always `/Users/pakkio/playground/investigatr`; use absolute paths or `cd` there before file edits, tests, or content creation.

**Application code — env-matched worktree.** Grab the environment from the Linear issue description, then find the worktree whose branch tracks the env's release branch — `origin/release/horizon-production` for production, `origin/release/horizon-staging` for staging:

```sh
git -C ~/Akkio worktree list
git -C <worktree> branch -vv   # confirm the tracked upstream
```

Run `git pull` in that worktree before reading anything there. Never read code from `~/Akkio` itself (it sits on an unrelated branch); if no worktree tracks the env branch, say so instead of substituting another checkout. Everywhere this skill says `~/Akkio`, it means this env-matched worktree — code references, `file:line` citations, and schema checks all come from it.

## Required CLIs

- Use `linear-cli` for all Linear reads. ONLY use Linear MCP if `linear-cli` is not available.
- Use `pup` for all Datadog reads. ONLY use Datadog MCP tools when `pup` is not available.
- Prefer `--output json --compact --fields ...` for `linear-cli` and `--output=json --limit=N` for `pup`; parse with `jq`.
- If either CLI returns an auth/config error, stop and report the missing access. Do not start interactive auth flows (`linear-cli auth`, `pup auth login`) unless the user explicitly asks.

## Goal / Success Criteria

A successful investigation lets an engineer understand what happened, why it happened or what remains unknown, who/what was affected, how to reproduce or validate it, and where to inspect or fix next.

**Honesty over confidence.** "Medium confidence — here are the 3 manual checks to confirm" is a success. Asserting a cause the evidence doesn't support is a failure even if it turns out right. Never present a root cause as confirmed while validation is pending.

## Evidence Discipline

- Every claim needs a link, query, command, file path, or trace ID. No claim, no statement.
- Every code reference carries `file:line`. No exceptions.
- Unverified reporter/user claims: tag `reported-unverified`. Never restate as fact.
- Reporter's suspected cause is input, not conclusion. Hunt for symptoms that break their framing.
- No evidence against ≠ evidence for. A hypothesis only survives if something observed supports it.
- Root cause needs a repro, a before/after deploy comparison, or a trace/code path that only this cause can explain.
- **Show the log, not just the conclusion.** The proof goes inline in `## Root cause` (exact shape under Required MDX Structure). Reasoning without quoted proof is not allowed there — delete the sentence or label it an unproven hypothesis.
- Evidence that convinced you in chat goes in the doc. Never delete generated SQL, request IDs, or trace IDs during a refactor.

## Running validation SQL

Run validation queries yourself via the `/query-postgres-hz` and `/query-snowflake-hz` skills. **Environment match is mandatory:** the query must run in the same environment where the issue was reported (production issue → production DB, staging issue → staging DB). If the skill's connection points at a different environment, do not run it — tell the user about the disconnect and that they may need to run the query themselves.

Every query — run by you or handed to the user — must be:

1. **Store-labeled** — "run in Snowflake" or "run in Postgres", and why the data lives there. When unsure, check the code path that reads/writes it; don't guess.
2. **Schema-verified** — confirm every table/column against ORM models/migrations in `~/Akkio`, a logged query that actually ran, or `information_schema`. Never invent names. For Postgres JSON columns, confirm `json` vs `jsonb` before using `?`/`->>`/`jsonb_*`.
3. **Cheap** — scope by ID and time range, add `LIMIT`, no full scans.
4. **In the doc** — validation queries and the full original problematic SQL stay in the MDX permanently.
5. **Explained up front** — "if X → confirms A; if Y → disproves A". When results contradict you, update your conclusion or take it back; never repeat the same claim.

## When to look in ~/blu-platform-transformations (dbt → Snowflake)

`~/blu-platform-transformations` is the dbt repo that builds every `BLUSHIFT_HMI_PROD` table: shared models in schema `BLUSHIFT_COMMON`, per-client views in `<CLIENT>_CLIENTDATA` (generated from `models/blushift_common/` templates; hand-written overrides start with `-- akkio: client-logic`). Its YAML descriptions/tags become Snowflake COMMENTs/TAGs, which the platform scrapes into "supplemental info" and injects into LLM prompts for SQL generation.

A "data issue" can live in four layers — isolate which one before blaming any of them:

1. **Upstream source feed** (TransUnion, Mastercard, Inscape, ...) — bad data arrived.
2. **dbt model in `~/blu-platform-transformations`** — wrong SQL/YAML, lookback window (`DBT_HISTORY_DAYS`), client mirror drifted from template.
3. **Snowflake table contents** — model is right but the dbt Cloud run failed or is stale (cadence tags `daily`/`weekly`/`monthly`).
4. **Platform supplemental-info cache** — Snowflake is right, cached metadata is stale until `ml/scripts/refresh_supplemental_info.py` runs.

Checks, in order: query the table via `/query-snowflake-hz`; `DESCRIBE TABLE` for live COMMENTs; compare with the supplemental info the LLM actually received (Datadog logs); read the model SQL/YAML in `~/blu-platform-transformations/models/`.

Look in blu-platform-transformations when: LLM SQL uses the wrong value format (case, hyphen vs underscore — column descriptions carry `:lower`/`:upper`/`:space-to-hyphen`/`:space-to-underscore` tags that promise a format); table/column descriptions in the LLM context are wrong or missing; a table exists for one client but not another; rows or partition dates are stale/missing; `data_type`/`use_for_audience_gen` tagging is wrong.

House rules: `git pull` `~/blu-platform-transformations` before reading. Origin is Bitbucket — no `gh`. Deploys are dbt Cloud only, so "what changed" means blu-platform-transformations git log + dbt Cloud run history, not Horizon deploys. Shared client-view bugs are fixed in `models/blushift_common/`, never in one client dir. For dbt change mechanics, read `~/blu-platform-transformations/AGENTS.md`.

Key platform files: `ml/src/dataset_parsing/datasource_info/` (metadata builder), `ml/scripts/refresh_supplemental_info.py` + `ml/scripts/SYNC_COMMON_TABLES.md` (refresh/sync), `apps/docs/docs/by-role/backend/architecture/blushift-dbt-pipeline.md` (architecture).

## Investigation Workflow

1. **Frame.** Before pulling Linear/Datadog, jot down:
   - Scope: systems, tenants, routes, jobs, time range, user actions in. What's out.
   - Access map: for each source (logs, traces, dashboards, code, DB, queue, flag, deploy), mark `available`, `partial`, `missing`, `unknown`. Declare gaps now, not at writeup.
   - Timebox: 20 min per hypothesis check unless user says otherwise.
   - Agent session: record the current agent type (`pi`, `claude`, `cursor`, `opencode`, etc.) and session ID before evidence collection starts. If the harness exposes a session UUID/path, use that exact value. If it does not, write `Unknown — <where checked>` in notes and resolve it before finalizing the MDX.
2. **Check duplicates.** `rg -il '<error text|symptom|entity id>' src/content/investigations/`. Same root cause elsewhere → link or flag, don't re-author.
3. **Grab Linear ticket info with `linear-cli`.** Use machine-readable output and narrow fields when possible:
   - `linear-cli issues get <TICKET-ID> --output json --compact` for title, body, metadata, labels, team/project, dates, URL, assignee, creator/reporter.
   - `linear-cli comments list <TICKET-ID> --output json --compact --all` for discussion, updates, logs, repro notes, impact, links, screenshots, attachments.
   - `linear-cli attachments list <TICKET-ID> --output json --compact --all` and `linear-cli uploads ...` for linked docs/images/attachments when useful.
   - `linear-cli api --output json` only when typed subcommands do not expose a needed field.
4. **Extract anchors.** Collect searchable IDs/terms: user email/ID, org/customer, project/resource/deployment IDs, trace IDs, request paths, service/env, timestamps, error text, feature names, affected entity IDs.
5. **Investigate Datadog deeply with `pup`.** Search logs/spans around the reported time, then widen. Start with aggregates, then fetch small representative samples:
   - `pup logs aggregate --query='<scoped query>' --from=<range> --compute=count --group-by=<field> --limit=20 --output=json`
   - `pup logs search --query='<scoped query>' --from=<range> --to=<range> --limit=20 --output=json`
   - `pup traces search --query='trace_id:<trace_id>' --from=<range> --output=json`
   - Add `pup rum`, `pup events`, `pup metrics`, `pup monitors`, or `pup incidents` queries when relevant.
   If no trace ID exists, discover candidates from strongest anchors and inspect only traces connected to the reported action/resource. Capture scoped Datadog URLs.
6. **Connect the evidence.** Build an ET timeline from Linear + Datadog + code/data. Mark `Unknown`, assumptions, and hypotheses explicitly.
7. **Check the triaged description.** Compare its central explanation of what broke, why, and impact against the runtime/code/data evidence—not against the ticket title or reporter's guess. Set `matches_triaged_description` in frontmatter: `true` only when the central mechanism and outcome materially match; `false` when the stated cause is contradicted or misses the actual failure mechanism; `null` only when no triaged description exists or evidence is insufficient to judge. Never leave it `null` because the check was skipped. State the mismatch or confirming evidence in `## TLDR` or `## Root cause` so the boolean is reviewable.
8. **Answer "why now".** For behavior with a start date, find the trigger before writing Root cause: commit/PR (author, merge + deploy time), flag/config/migration, or first qualifying input — verified with before/after evidence (error counts by day, deployed versions around first-seen). Map SHAs to commits/PRs and compare the relevant code; decide whether code, data, upstream behavior, branch/release, or migration context changed. No trigger found → say so in the doc and cap confidence at `medium`.
9. **Verify root cause before claiming it.** Confirm production entity IDs, persisted fields/state, user-authored input/config, read/write code paths, start time, frequency, blast radius, recurrence, and ruled-out hypotheses. Do not say `likely bad data` unless the data was directly inspected.
10. **Reproduce or document limits.** Every investigation needs `## Reproduction steps`, on the real end-user surface (never `review-chat`/`rating-chat`). Use exact browser/API/CLI steps, prerequisites, expected visible result/error, and screenshots/video when the user asks to reproduce. Screenshots must visibly show the symptom (annotated + captioned). If unsafe or impossible, provide the closest safe partial repro and explain exactly what prevents full reproduction. Use `chrome-devtools-cli` when asked to reproduce; Chrome MCP is fallback.
11. **Explain for newcomers.** Define codebase-specific services, queues, cron jobs, integrations, tables, features, and acronyms in plain language.
12. **Write and validate MDX.** Keep prose under 200 lines when possible (diagrams and SQL blocks exempt). Run `npm run build` after content changes when feasible. If access to Linear/Datadog/data/code is missing, state exactly what is unavailable instead of guessing.

## Extra Depth Requirements

For production incidents:

- Find first-seen time and count occurrences by hour/day.
- Compare before/after suspected deploys.
- Capture representative logs containing the actual problematic fields.
- Avoid unrelated request traces as representative evidence.

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

Use the exact Linear ticket ID. Store any supporting assets in `assets/` and reference them as `./assets/file.<file-extension>`.

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
golden_test: false
matches_triaged_description: true # true | false | null; use the evidence rules below
---
```

Tags must include

- one ticket type -- `chat_review` if linear ticket content contains "Chat Review", otherwise `service_now`
- one or more issue types, such as `test`, `no_description`, `no_bug`, `auth_access_issue`, `loading_rendering_issue`, `incorrect_sql`, `inefficient_sql`, `data_issue`, `infra_error`, `chat_response_issue`, `user_issue`, `chart_visualization_issue`, `ui_ux_issue`, `feature_request`, or `uncategorized`.

`matches_triaged_description` is an evidence verdict, not a similarity check:

- `true` — the triaged description's central failure mechanism and user-visible outcome match the investigation. Minor wording or scope differences are okay.
- `false` — its central cause is contradicted, or it attributes the symptom to the wrong layer/mechanism. Explain the correction in the doc.
- `null` — the ticket has no triaged description, or required evidence is unavailable. State which evidence is missing; do not use `null` as "not checked."

## Required MDX Structure

Start with:

```md
# AKKIO-12345 — Short factual title

> Reporter: Name (email), Customer/Org if known
> Project: Project/resource URL if known
> User Feedback (if chat review)
> Triaged description (if chat review)
```

Then add `## Summary`. The table below is the required baseline, not a limit: include its rows when evidence supports them, and **add any other rows you judge important** for this specific issue (deploy SHA, flag state, job/queue IDs, upstream feed, affected table, etc.). Treat it as a floor, not a ceiling.

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
| Triaged-description match       | `true` / `false` / `null` — one-line evidence reason    |
| Error / exception               | exact error text                                        |
| Downstream dependency           | external service/API if relevant                        |
| App area                        | e.g. Audience builder → Chat                            |
| Datadog — logs                  | scoped URL                                              |
| Datadog — trace                 | URL                                                     |
| Datadog — metrics/RUM/events    | scoped URL                                              |
| Agent session type(s)           | `pi`, `claude`, `cursor`, `opencode`, etc.              |
| Agent session ID(s)             | exact session UUID/path for each agent session used     |

After `## Summary`, include:

- `## TLDR` — 2–5 beginner-friendly bullets that state what the issue is.
- `## Timeline (ET)` — numbered user action → backend/worker/downstream → symptom.
- `## Root cause` — short explanation of what caused what. **Every claim must be backed by quoted proof in the doc.** Required shape:
  1. Lead with the key log line(s) — the ones that prove the cause — as a fenced code block, with the `pup` query that found them and (when possible) a scoped Datadog URL.
  2. Either a field-by-field table (`Field in the log` → `What it tells us` → `What it rules out`) or inline annotations that show how each piece of the log supports each step of the inference.
  3. Any cross-query that establishes scope/blast-radius (e.g. "same error on N other entities") shown with the exact `pup` command and a count.
  4. Any code path referenced as part of the mechanism cited by `file:line` from `~/Akkio`.
  5. The "why now" trigger: what changed (commit/PR + author + deploy time, flag, migration, or first qualifying input) with before/after evidence — or an explicit statement that the trigger is unknown.
  6. Data issues are a valid root cause: bad/missing/stale/mistagged rows in Postgres/Snowflake or an upstream feed. Prove it with the query result showing the bad data (not just the code that read it), and say where the data came from.
  7. If the root cause is `Unknown`, say so and list the specific log/trace/metric/state the next person needs to capture to close the gap.
- `## Root cause confidence` — one of:
  - `confirmed` — repro, before/after deploy comparison, or a trace/code path only this cause can explain — with the proof in this doc.
  - `high` — strong evidence from several independent sources, no repro; name the one check that would confirm.
  - `medium` — believable mechanism, but evidence is indirect or the trigger is unknown. "Latent bug, trigger unknown" can never exceed `medium`.
  - `low` — best-ranked hypothesis; a lead, not a finding.

  State the evidence class behind the level and what would move it up one. Never `confirmed` while `## Manual validation required` has open items bearing on the cause.
- `## How it broke — call stack & flow` — REQUIRED:
  1. Sequence/flow diagram of the failing request, as a fenced ```mermaid block (the site renders them): user action → frontend route/component → backend endpoint/worker → downstream (LLM, Snowflake, external API), failure point marked (`❌`).
  2. Call graph of the failing code path, as a fenced text block: indented arrows, one call per line, real function name + `file:line` on every node, failure point marked and annotated. Use mermaid instead only if branching makes the linear form awkward. Format:

     ```text
     POST /api/chat handler — api/src/routes/chat.py:41
       → ChatService.handle_message — api/src/services/chat.py:118
         → build_sql_context — ml/src/chat/context.py:77
           → AudienceStore.get_audience — ml/src/audience/store.py:203   ❌ returns row for deleted audience 748
             → run_snowflake_query — ml/src/query/runner.py:55           ← never reached
     ```

  3. Component tree of the affected UI when frontend is involved, as a fenced text block: tree branches, real component names + `file:line`, and under each component only the state/props/callbacks relevant to the bug, with the bad one marked. Format:

     ```text
     <AudienceExplorePage> — frontend/src/pages/AudienceExplore.tsx:30
     ├── <ChatPanel> — frontend/src/components/chat/ChatPanel.tsx:88
     │     State: messages, activeChartId          ❌ activeChartId stays stale after audience switch
     │     Callbacks: onSendMessage → POST /api/chat
     └── <ChartView chartId={activeChartId}> — frontend/src/components/charts/ChartView.tsx:41
           Props: chartId                          ← renders the stale chart
     ```

  Diagrams are for finding the code and evidence, not decoration: real names, real `file:line`, ≤ ~15 nodes each — split rather than cram. Annotate only what's relevant to the bug.
- `## ELI5 walkthrough` — short narrative a junior dev new to the codebase can follow: what the user did, what the system tried, where it broke, why that produced the symptom. Define platform concepts inline; reference the diagrams.
- `## Reproduction steps` — exact steps on the real user surface. If full reproduction is impossible, include a safe partial repro and explain exactly what prevents full reproduction. Attach the assets in the .mdx file.
- `## Manual validation required` — the honesty section. Numbered, copy-pasteable checks that confirm or break the RCA, each following "Running validation SQL" (store-labeled, schema-verified, cheap, explained up front). Run them yourself via `/query-postgres-hz`/`/query-snowflake-hz` when the environment matches the issue; otherwise flag the disconnect for the user. Include non-SQL checks (UI, Firestore, ask reporter). If nothing manual is needed, say so explicitly — never omit the section.
- `## Possible fixes` — REQUIRED. Classify each candidate:
  1. **Code change** — which side (frontend / backend / ml / worker) and service; if both FE and BE angles exist, address both.
  2. **Data fix** — correct/backfill/re-sync/retag the bad data; name the exact table(s) and rows, where the bad data came from, and who owns that pipeline. Say which layer it is (upstream feed / dbt model in `~/blu-platform-transformations` / stale dbt Cloud run / stale supplemental-info cache) with the evidence. A blu-platform-transformations fix = dbt model/YAML change + client resync (`gen_client_schema.py`) + supplemental info refresh; a refresh-only fix = Snowflake is right and only the cache is stale.
  3. **Context/config change** — platform-injected prompt/context, Databricks config, flags (not the user's prompt).
  4. **User behavioral change** — prompt workaround or alternate flow usable today.
  5. **Not a bug** — training/enablement; say why the behavior is correct.

  Rank by simplicity + correctness; smallest fix wins; cite real `file:line` only. Fixes implemented in `~/Akkio` require tests (TDD) in a fresh worktree off `release/horizon-staging`.
- `## Shareable comment` — terse non-technical paragraph pasteable into Slack/Linear: what broke, why, who's affected, fix direction. Keep key IDs for traceability.

Optional when useful:

- `## Data flow` — extra Mermaid/ASCII diagrams beyond the required ones.
- `## Relevant files` — code paths and line ranges.
- `## Glossary` — customer/domain terms.

## Interactive Session Behavior

- **Pre-answer the standard follow-ups.** Every draft gets asked: prove it; what query do I run myself; why now / what changed; where in the code; FE or BE; eli5; what's the fix. If the doc can't answer all of these, it isn't done.
- **Don't edit the doc unless told.** Questions and brainstorming get chat answers. Write to the MDX only on explicit instruction.
- **On root-cause pushback, don't re-read the same code.** "Not convinced" usually means right function, wrong mechanism — pull the actual runtime input (real prompt/context/SQL/log payload).
- **User-pasted results and screenshots are ground truth.** Update your conclusion or take it back.
- **Self-serve data.** Fetch mentioned S3 paths, logs, and session files yourself.
- **Answer the question asked.** Don't drift to an adjacent question.

## **MUST DO** Self-Review Before Finalizing

- Could a junior engineer tell where to look next, with all lookup IDs present (user, org, project, resource, trace, job, agent session)?
- Does the Summary include both `Agent session type(s)` and `Agent session ID(s)`? Do not finalize with either blank; use `Unknown — <where checked>` only when the harness truly does not expose it.
- Walk each Root cause sentence: every claim points to a quoted log, trace id, `file:line`, SQL result, or Linear comment in the doc — fix or delete any without proof.
- Is `## Root cause confidence` consistent with open `## Manual validation required` items?
- Does `matches_triaged_description` follow the evidence rules, and does the TLDR/Root cause explain the verdict? If it is `null`, is the missing description/evidence named?
- Missing facts labeled `Unknown` with the exact next query/tool needed?
- No evidence (generated SQL, request/trace IDs) lost during edits?
- Did `npm run build` pass?

## Writing Standards

USE PLAIN LANGUAGE-- NO CANONICAL,PROVENANCE and the like. Be factual, concise, beginner-friendly, and evidence-backed. Use ET timestamps (`EST`/`EDT` when known). Include exact IDs, trace IDs, service names, URLs, and error strings. Prefer observations over commentary. Preserve uncertainty. Limit customer-sensitive detail to what engineering diagnosis requires. No fluff: every sentence either states evidence, a conclusion, or a next step.
