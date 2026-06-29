---
name: akkio-base
description: Akkio platform foundation — API surfaces, auth, async polling, data-store topology, and which Akkio skill to reach for. Pair with the akkio-* skills.
disable-model-invocation: true
---

# Akkio Base

The keystone for the `akkio-*` skill suite: shared facts about surfaces, auth, data topology, and routing. Every other Akkio skill assumes what is here instead of restating it. No CLI or MCP exists — skills drive the REST API directly and read data through the guarded query skills.

## Nouns

- **Dataset** — tabular data.
- **Project** — wrapper around a dataset for transforms, Chat Explore, training, and deployment. Holds chat instructions.
- **Chat Explore** — LLM experience over a dataset/project.
- **Model** — a trained *tabular* ML predictor (classification/regression/forecasting), **not** the chat LLM.
- **Training / Predict / Forecasting** — tabular ML workflows.

## API surfaces (never mix)

| Surface | Base path | Auth | Covers |
|---|---|---|---|
| v2 | `https://api.akkio.com/api/v1/...` | `X-API-Key` header | Chat Explore, Projects, Training |
| legacy | `https://api.akkio.com/v1/...` | `api_key` query/body param | Datasets CRUD, model list/predict/delete |

- Key lives in `AKKIO_API_KEY`. `401` = missing/invalid key (often whitespace or wrong header); `403` = valid key, org lacks access; `422` = payload failed schema validation.
- Trust the OpenAPI schema (`https://api.akkio.com/api/v1/api.yaml`) over prose docs. v2 is beta.
- Many v2 schemas set `additionalProperties: true` — tolerate extra fields.
- If `_org` / `_owner` are required and unavailable, say so — the docs don't explain how to discover them.

## Async pattern

Only `SUCCEEDED` is success. Poll on `PENDING` and `IN_PROGRESS`; fail on `FAILED` and `UNKNOWN_TIMEOUT`. Parse `metadata.location` literally — don't concatenate URLs. Implement submit → poll → fetch-result as one reusable helper.

## Data topology (for investigations)

A customer-facing fact lives in exactly one store — name it before querying.

| Store | Holds | Read via |
|---|---|---|
| **Postgres** (horizon-production transactional) | App entities: charts, projects, dashboards, tenants, datasources — names and integer IDs | `/query-postgres-hz` |
| **Snowflake** (`BLUSHIFT_HMI_PROD`) | The data layer / audience data customers query | `/query-snowflake-hz` |
| **dbt** (`~/blushift`) | The models that *build* the Snowflake tables | read repo (Bitbucket, no `gh`) |
| **Datadog** (logs/traces) | Request payloads, prompts, generated SQL, trace IDs | `/datadog-investigate` (pup) |

A "data issue" can sit in any of four layers — upstream feed → dbt model → Snowflake contents → stale supplemental-info cache. Isolate the layer before blaming it.

## Environments

`production` and `staging`. **Env-match is mandatory** in investigations: a production issue is reproduced against production data only. Code references come from the env-matched `~/Akkio` worktree (the bare `~/Akkio` checkout sits on an unrelated branch), never the default checkout.

## Skill router

| Task | Skill |
|---|---|
| Build/debug an Akkio API client (v2 or legacy) | `akkio-api-expert` (archived; revive if needed) |
| "Customer reported X" — where do I start | `akkio-investigate` |
| Trace one incident through logs/traces | `datadog-investigate` |
| Author a full evidence-backed RCA writeup | `rca` |
| Read app entity IDs/names | `query-postgres-hz` |
| Read the Snowflake data layer | `query-snowflake-hz` |

## Auth discipline

CLIs (`pup`, `linear-cli`, `aws`) are normally pre-authenticated. On an auth error, **stop and tell the user** — never start an interactive login flow (`pup auth login`, `aws sso login`) unless explicitly asked.
