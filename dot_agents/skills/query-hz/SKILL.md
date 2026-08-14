---
name: query-hz
description: Run guarded, read-only queries against Akkio Horizon Postgres or Snowflake. Use Postgres for app entities such as charts, projects, dashboards, and tenants; use Snowflake for warehouse data, datasource validation, and analytics. Match the database environment to the investigation. Agents must use the bundled scripts only.
compatibility: Postgres requires python3 and either psql or Docker; Snowflake requires uv, network access, and ~/.dbt/profiles.yml. AWS CLI is only used for explicit Postgres --from-secrets.
disable-model-invocation: false
---

# Query Horizon

Use this skill when logs, Datadog, or other investigation sources do not contain the required database fact.

## Choose the backend

- **Postgres:** charts, projects, dashboards, tenants, app IDs, and transactional metadata.
- **Snowflake:** customer data, warehouse rows, aggregates, datasource validation, and analytics.

Always use the environment where the issue occurred. Production results must come from production; do not silently substitute staging or dev.

## Postgres

Run `envs` before the first Postgres query in a session. It reports URL source, route, and reachability.

```bash
S=~/.agents/skills/query-hz/scripts/query-postgres-hz.sh
$S envs
$S --env staging lookup-chart 526599
$S --env staging lookup-project 1109853
$S --env staging -c "SELECT ..."
```

The script supports `--env production|staging|dev|local`, `--from-secrets`, and `--max-lines N`. It uses Docker VPN sidecars for production and staging when available.

Every query reports its environment and host on stderr. Confirm them before citing results. Read the Postgres references for query templates, environment resolution, and secrets access:

- [references/queries.md](references/queries.md)
- [references/secrets-and-access.md](references/secrets-and-access.md)

## Snowflake

Use the bundled script and the `blushift` profile from `~/.dbt/profiles.yml`.

```bash
Q="uv run ~/.agents/skills/query-hz/scripts/query-snowflake-hz.py"
$Q --sql "select count(*) from V_DAILY_BLU_FACT_BROWSING_SUMMARY"
$Q --target staging --sql "..."
$Q --file /tmp/check.sql --format json --max-rows 200
```

Targets are `prod` (default), `staging`, and `dev`. The script allows exactly one read-only statement beginning with `SELECT`, `WITH`, `EXPLAIN`, `SHOW`, `DESCRIBE`, `TABLE`, or `VALUES`.

Defaults are `--max-rows 50`, TSV output, and a 600-second statement timeout. Capture and cite `query_id` from stderr.

## Hard rules

- Use the bundled script for the selected backend. Never use raw `psql`, `snow`, `snowsql`, dbt, connectors, notebooks, or ad-hoc clients.
- Run read-only SQL only. If the guard blocks a query, rewrite it or stop. Never bypass the guard.
- Never paste database URLs, passwords, tokens, or customer-sensitive rows into chat, docs, or commits.
- Never run `aws sso login`. On `AUTH_REQUIRED`, ask the user to run it manually.
- Start with the smallest query that answers the question. Filter, aggregate, and limit results.
- Do not loop on the same failure. Follow the backend-specific error message and stop when access or environment setup needs the user.
