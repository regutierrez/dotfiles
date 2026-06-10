---
name: query-snowflake-hz
description: Runs read-only SQL against Akkio Horizon Snowflake using ~/.dbt/profiles.yml through a guarded script. Use when investigations need Snowflake data checks, BLUSHIFT_HMI_PROD queries, datasource validation, or warehouse analytics. Agents must use the bundled script only; not for writes, DDL/DML, dbt runs, migrations, or raw snow/snowsql/Python connector usage.
compatibility: Requires uv, ~/.dbt/profiles.yml with a Snowflake profile, network access to Snowflake.
---

# Query Snowflake HZ

Read-only Snowflake querying for Horizon/Akkio investigations. Credentials come from local `~/.dbt/profiles.yml`.

## Mandatory rule

**Always use the bundled script for Snowflake queries:**

```bash
uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py --sql "select current_version()"
```

Do **not** use raw `snow sql`, `snowsql`, dbt, ad-hoc Python connector scripts, notebooks, or other Snowflake clients from agent tasks. If the script blocks a query, stop or rewrite it as read-only. Do not bypass the guard.

## Defaults

- dbt profile: `blushift`
- target: profile `target` if set, otherwise `prod`
- default schema if missing: `BLUSHIFT_DEMO`
- default timeout: `600` seconds
- default max rows fetched: `1000`
- query tag: `query-snowflake-hz`

The script reads only connection fields from `profiles.yml` and never prints passwords/tokens.

## Allowed SQL shape

The script accepts exactly one read-only statement beginning with:

- `SELECT`
- `WITH`
- `EXPLAIN`
- `SHOW`
- `DESCRIBE` / `DESC`
- `TABLE`
- `VALUES`

It rejects mutating/session-control keywords before connecting, including `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `COPY`, `PUT`, `REMOVE`, `GRANT`, `REVOKE`, `CALL`, `USE`, `SET`, `BEGIN`, `COMMIT`, `ROLLBACK`, `TO_QUERY`, and `SYSTEM$` functions.

## Usage

Inline SQL:

```bash
uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py \
  --schema BLUSHIFT_DEMO \
  --format json \
  --sql "select current_database(), current_schema(), current_role()"
```

SQL file:

```bash
uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py \
  --file /tmp/check.sql \
  --format csv \
  --max-rows 5000
```

Stdin:

```bash
cat /tmp/check.sql | uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py --format table
```

Override target/profile only when needed:

```bash
uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py \
  --profile blushift \
  --target prod \
  --database BLUSHIFT_HMI_PROD \
  --schema BLUSHIFT_DEMO \
  --sql "select count(*) from V_DAILY_BLU_FACT_BROWSING_SUMMARY"
```

## Agent workflow

1. Use Datadog/Linear/logs first for request IDs and anchors.
2. Write the smallest read-only Snowflake query that validates the missing fact.
3. Run it through `query-snowflake-hz.py` only.
4. Capture `query_id=...` from stderr and cite it with the SQL/result.
5. Redact customer-sensitive rows and never include profile secrets in writeups.

## Failure modes

| Symptom | Action |
| --- | --- |
| `profiles.yml not found` | Ask user to create/restore `~/.dbt/profiles.yml`. |
| `Profile ... not found` / `Target ... not found` | Ask which dbt profile/target to use, then pass `--profile` / `--target`. |
| Snowflake auth error | Stop and ask the user to refresh/fix local dbt credentials. Do not start interactive auth flows unless explicitly asked. |
| `Blocked:` | Rewrite as a read-only single statement or stop. Do not use another client. |
| Timeout | Narrow date range, add filters, or increase `--timeout` if the user agrees. |

## Self-check before citing

- [ ] Query ran through the bundled script.
- [ ] SQL is one read-only statement.
- [ ] Used the intended database/schema/target.
- [ ] Captured the Snowflake `query_id`.
- [ ] No credentials or secrets copied into chat, docs, or commits.
