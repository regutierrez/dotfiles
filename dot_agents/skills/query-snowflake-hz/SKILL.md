---
name: query-snowflake-hz
description: Runs read-only SQL against Akkio Horizon Snowflake (BLUSHIFT_HMI_PROD/STAGING/DEV via dbt targets) through a guarded script using ~/.dbt/profiles.yml. Use for investigation data checks, datasource validation, or warehouse analytics. Agents must use the bundled script only; not for writes, DDL/DML, dbt runs, or raw snow/snowsql/connector usage.
compatibility: Requires uv, ~/.dbt/profiles.yml with a Snowflake profile, network access to Snowflake.
---

# Query Snowflake HZ

Read-only Snowflake querying for Horizon/Akkio investigations. Credentials come from `~/.dbt/profiles.yml` (static service user — all targets normally work).

```bash
Q="uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py"
$Q --sql "select count(*) from V_DAILY_BLU_FACT_BROWSING_SUMMARY"          # prod
$Q --target staging --sql "..."                                            # staging
$Q --file /tmp/check.sql --format json --max-rows 200                      # file input
```

Do **not** use raw `snow sql`, `snowsql`, dbt, ad-hoc connector scripts, or notebooks. If the script blocks a query, rewrite it read-only or stop — never bypass the guard.

## Targets (environment selection)

Profile `blushift`; pick the environment with `--target`:

| `--target` | Database | Role |
|---|---|---|
| `prod` (default) | `BLUSHIFT_HMI_PROD` | `PC_AKKIO_PROD_ROLE` |
| `staging` | `BLUSHIFT_HMI_STAGING` | `PC_AKKIO_STAGING_ROLE` |
| `dev` | `BLUSHIFT_HMI_DEV` | `PC_AKKIO_ROLE` |

Match the target to the environment under investigation; results from the wrong database look plausible but are wrong. `--database`/`--schema`/`--warehouse`/`--role` override individual fields when needed.

## Defaults (token-lean; override only with reason)

- `--max-rows 50` (fetches +1 to report `truncated=true` on stderr — raise deliberately, and prefer aggregating in SQL over fetching rows)
- `--format tsv` (densest; `json` is compact single-line; `table` for human eyes)
- `--timeout 600` statement seconds; connection login fails fast after 20s
- query tag `query-snowflake-hz`; passwords/tokens are never printed

## Allowed SQL shape

Exactly one read-only statement starting with `SELECT`, `WITH`, `EXPLAIN`, `SHOW`, `DESCRIBE`/`DESC`, `TABLE`, or `VALUES`. Mutating/session keywords (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `COPY`, `PUT`, `GRANT`, `CALL`, `USE`, `SET`, `BEGIN`, `COMMIT`, `SYSTEM$`, …) are rejected before connecting; string literals are ignored by the check.

## Workflow

1. Anchor on Datadog/Linear/logs first; query Snowflake only for the missing fact.
2. Write the smallest read-only query that answers it (aggregate, filter, LIMIT).
3. Capture `query_id=...` from stderr and cite it with the SQL/result.
4. Redact customer-sensitive rows; never copy profile secrets anywhere.

## Failure → action (do not loop)

| Symptom | Action |
|---|---|
| `profiles.yml not found` / `Profile ... not found` | Ask the user; pass `--profile`/`--target` as they specify. |
| Snowflake auth error | Stop; ask the user to fix `~/.dbt/profiles.yml` credentials. No interactive auth flows. |
| `Blocked:` | Rewrite as one read-only statement or stop. Never switch clients. |
| Timeout / connection hangs | Narrow the query (filters, date range). Raise `--timeout` only with user's okay. |
| `truncated=true` | Aggregate or filter in SQL rather than raising `--max-rows`, unless rows themselves are the deliverable. |
