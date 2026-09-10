# Investigatr authoring

Load when asked to create or update an investigation writeup. Investigation questions alone do not authorize MDX edits.

## Locate the target

The Investigatr checkout is `~/repos/investigatr` — a bare repo plus worktrees, with `~/repos/investigatr/main` on the default branch. Write there; confirm the layout with `git -C ~/repos/investigatr worktree list` rather than assuming the path persists. Never create a stand-in directory or write into another repository.

Read `src/content.config.ts` before editing; the live Zod schema is authoritative and rejects the build on any missing or mistyped field. Search `src/content/investigations/` for the ticket and for related reports first — update an existing ticket folder rather than creating a duplicate. Similar symptoms do not prove a duplicate cause; link related tickets instead of merging them.

```text
~/repos/investigatr/main/src/content/investigations/<TICKET-ID>/
├── index.mdx
└── assets/
```

Use the exact Linear ticket id as the folder name (`AKKIO-16183`, `TRI-7321`). Store supporting assets in `assets/` and reference them as `./assets/<file>`. Retain the original generated SQL, validation results, request and trace ids, and any evidence that changed the conclusion — never drop them during a rewrite. Do not dump unrelated logs or unnecessary customer data; redact secrets and personal information without removing diagnostic meaning, and label each redaction.

## Frontmatter

Eight fields, all required by the schema, in this order. Every one of the 375 existing investigations follows this shape — match it exactly:

```yaml
---
ticket_id: AKKIO-16183
title: Spectrum Business Measurement dashboard freezes on a 2000-row CAMPAIGN_METRICS pivot
tags:
  - service_now
  - loading_rendering_issue
created_at: 2026-09-10
updated_at: 2026-09-10
linear_url: https://linear.app/akkio/issue/AKKIO-16183/new-servicenow-incident
golden_test: false
matches_triaged_description: null
---
```

**`ticket_id`** — the Linear identifier, matching the folder name.

**`title`** — a factual one-line finding, not the ticket's own title and not a restatement of the symptom alone. Name the concrete entity and the mechanism. Real examples from the corpus:

- `Dating-sites table computed Reach and Index but left Value null`
- `Tropical Smoothie audience 36637 took 23 minutes because Snowflake scanned 5.1 TB of SEARCH/LIKE unions`
- `Monthly income chat shows generic "stopped" copy after a Sep 5 templated-success indent bug`

Unquoted YAML scalar. Quote it only when the value starts with a character YAML would misread; a colon inside the sentence usually needs quoting, so prefer an em dash.

**`tags`** — a YAML list, ticket type first, then one or more issue types. Ticket type is `chat_review` when the Linear ticket contains "Chat Review", otherwise `service_now`. Use the established issue vocabulary rather than inventing a tag, because every new tag creates a one-document facet:

`chat_response_issue`, `incorrect_sql`, `inefficient_sql`, `data_issue`, `chart_visualization_issue`, `ui_ux_issue`, `loading_rendering_issue`, `infra_error`, `auth_access_issue`, `user_issue`, `no_bug`, `no_description`, `feature_request`, `test`, `uncategorized`.

Two or three tags total is typical.

**`created_at` / `updated_at`** — unquoted `YYYY-MM-DD` dates parsed as dates, not strings. Both are the authoring date on a new document. When updating an existing investigation, preserve `created_at` and set `updated_at` to today.

**`linear_url`** — the canonical issue URL including its slug, as Linear renders it (`https://linear.app/akkio/issue/<TICKET-ID>/<slug>`). The schema validates it as a URL.

**`golden_test`** — `false` unless the user explicitly designates the document as a golden test; only 2 of 375 are `true`. Never set it to advertise a good writeup.

**`matches_triaged_description`** — an evidence verdict about the central failure mechanism and outcome, not textual similarity:

- `true` — the triaged description materially matches the runtime, code, and data evidence. Minor wording or scope differences are fine.
- `false` — its central cause is contradicted, or it attributes the symptom to the wrong layer or mechanism. Explain the correction in the document.
- `null` — the ticket has no triaged description, or the evidence needed to judge it is unavailable. Say which, in TLDR or Root cause.

Never use `null` because the check was skipped. The corpus currently runs 303 `null` / 52 `false` / 20 `true`, and most of those nulls are ServiceNow tickets with no triaged description at all — if a triaged description exists, the verdict is `true` or `false` unless you can name the missing evidence.

## Document body

Open with `# <TICKET-ID> — <title>`, repeating the frontmatter title verbatim, then a blockquote header carrying the report's provenance — the corpus shape:

```md
# AKKIO-16183 — Spectrum Business Measurement dashboard freezes on a 2000-row CAMPAIGN_METRICS pivot

> Reporter: Name on behalf of Name (`email`), Customer
> Project: https://blu.sky.horizonmedia.com/projects/<uuid>/dashboard/report
> ServiceNow: `INC0070788`, `sn_sys_id: ...`
> User Feedback: reported-unverified — what the reporter said, in their framing
> Triaged description: None. Ticket is a ServiceNow sync of the symptom, not a cause.
```

Include the lines that apply and drop the rest. Label reporter claims `reported-unverified` and never restate them as fact.

Then the eight required sections from the main skill, in order: TLDR, Issue and scope, Timeline (ET), Root cause, How it broke — call path and failure flow, Reproduction and validation, Resolution handoff, Residual gaps / next evidence. Include every section; where an artifact is unavailable or inapplicable, say which and why instead of inventing it.

Section-specific notes for the writeup:

- **Issue and scope** — a table reads better than prose. Cover representative request and trace ids, other attempts, user, tenant, project and affected entity ids, the real end-user route and launch context, services, environment, per-service revision, reported versus earliest-observed versus reproduced times kept distinct, observed frequency and separately the potentially exposed condition, exact user-visible symptom, raw error, the triaged-description verdict with its reason, scoped Datadog links, downstream dependency, and the agent session type and id (`Unknown — <where checked>` when the harness does not expose it). Mark missing anchors Unknown rather than dropping the row.
- **Timeline** — keep UTC in the evidence and ET for the reader; keep attempts and deployment events separate.
- **Root cause** — lead with the strongest proof, include the command or query with its environment, window and revision, and explain what each observation establishes and what it does not. Cite every causal code step by repository, revision, and `file:line`. A quoted log is not mandatory when a reproduction or revision diff is stronger.
- **Reproduction and validation** — distinguish a live reproduction on the real user surface (never a review or rating tool) from an integration or isolated check, and from steps you are only suggesting. Retain the command, revision, decisive assertion, and output for anything you ran. Inspect captured media before claiming it shows the symptom, and caption it. Never mutate production merely to reproduce.
- **Residual gaps** — list open checks with the exact command or query, target environment and store, the expected outcome under each competing hypothesis, and why it matters. Distinguish checks needed for the mechanism from optional onset, impact, or UI confirmation.

A short shareable paragraph for Slack or Linear is optional but useful: what broke, the supported cause or the uncertainty, observed impact, and handoff direction, keeping the ids. Never imply a fix is deployed merely because it exists.

Keep prose under roughly 200 lines when practical (diagrams and SQL blocks exempt); preserve necessary evidence rather than meeting a length quota.

## Validation

Read the final MDX, check the eight frontmatter fields against the live schema, check asset links resolve, and run `npm run build` (`astro build && pagefind --site dist`) in `~/repos/investigatr/main` when feasible. Report the actual result, or why it was unavailable. A green build verifies authoring, not the RCA. Then check that every causal sentence has supporting evidence in the document, that revision-specific line citations match, that stated confidence agrees with the open checks, and that no evidence was lost in editing.

### Heading drift from the existing corpus

Every existing investigation uses the older eleven-heading layout — `## Summary`, `## TLDR`, `## Timeline (ET)`, `## Root cause`, `## Root cause confidence`, `## How it broke — call stack & flow`, `## ELI5 walkthrough`, `## Reproduction steps`, `## Manual validation required`, `## Possible fixes`, `## Shareable comment`. This skill's layout folds `Root cause confidence` into Root cause, `ELI5 walkthrough` into the opening paragraph of How it broke, `Manual validation required` into Residual gaps, and replaces `Possible fixes` with `Resolution handoff`. Nothing in the site keys on heading text, so both render. Do not retrofit old documents unless asked.
