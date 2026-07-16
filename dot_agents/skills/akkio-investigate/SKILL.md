---
name: akkio-investigate
description: Entry point for "a customer reported X" — pick the right store and skill, anchor on identifiers, trace to root cause. Router over datadog-investigate, the query skills, and rca.
disable-model-invocation: true
---

# Akkio Investigate

The **router** for Akkio data investigations: it decides *where to look and which skill to drive*, then hands off. It does not duplicate the pup recipes (`datadog-investigate`), SQL templates (`query-postgres-hz` / `query-snowflake-hz`), or writeup structure (`rca`) — those skills own their detail. Read `akkio-base` first for surfaces, data topology, and the env-match rule.

## First decision

**Does the user want a documented writeup?** If yes — a Linear ticket to investigate and document — stop here and use `/rca` (it owns the full MDX authoring flow and pulls in everything below). Use *this* skill for live tracing, scoping, and "where do I even start" without the MDX ceremony.

## Anchor first

Collect the strongest identifiers before querying anything: user email/uid, org id, project/chart/resource id, trace id, timestamp, error string, customer name. Cheap aggregates over an anchor beat dumping logs.

## Discovery ladder (stop when you have the answer)

1. **Logs & traces — `/datadog-investigate`.** Anchor on email/org → aggregate to candidate `request_id`s → pull the fat "Done" log (prompt, generated SQL, result, `trace_id`) → expand to the trace. The request payload usually answers the question by itself.
2. **App entity gaps — `/query-postgres-hz`.** When logs have a `chart_id`/`teamId`/`org_id` but not project/dashboard names or integer IDs, or you need tenant ↔ Firestore-id resolution.
3. **Data-layer gaps — `/query-snowflake-hz`.** When the symptom is about the *data the customer queried* (`BLUSHIFT_HMI_PROD`): wrong/missing/stale rows, audience contents.
4. **Build-layer — `~/blu-platform-transformations`.** When Snowflake contents are wrong, trace to the dbt model / YAML / lookback that built them, or a stale dbt Cloud run / supplemental-info cache. See `rca`'s blu-platform-transformations section for mechanics.

## Store decision

Name the store before writing SQL — see the data-topology table in `akkio-base`. Postgres = app entities (charts, projects, tenants). Snowflake = the customer data layer. When unsure which store holds a fact, check the code path that reads it in the env-matched `~/Akkio` worktree; don't guess.

## Discipline

- **Env-match is mandatory.** Production issue → production data. If a query skill's connection points elsewhere, don't run it — flag the disconnect.
- **Co-occurrence check.** A secondary id (`stream_id`, `payload_id`, child `request_id`) only counts if it appears in the *same* log line as the primary `request_id` — text search can grab a different turn from the same user. Label or drop ids sourced from a different entry.
- **Cite the evidence.** Snowflake `query_id`, the exact `pup` query, the request/trace id. Quote SQL/payloads verbatim — never paraphrase.
- **Read-only only.** Both query skills reject mutating SQL; don't bypass with raw `psql`/`snow`.

## Handoff

When the trace is complete and the user wants it written up, switch to `/rca` — carry the anchors, the verbatim payload, the `query_id`s, and the layer you isolated. Don't re-run the discovery you already did.
