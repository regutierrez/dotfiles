---
name: query-postgres-hz
description: Runs read-only SQL against Akkio Horizon production transactional Postgres via psql, resolving BACKEND_DB_URL from env or local files first (no AWS by default). Use when investigations need chart→project/dashboard/tenant IDs not in Datadog/logs. Secrets Manager is opt-in via --from-secrets; agents must never run aws sso login — on auth failure, ask the user to log in manually. Not for writes, migrations, or staging/dev DBs.
compatibility: Requires psql, python3, VPN to horizon-production RDS. aws CLI only when using --from-secrets.
---

# Query Postgres (Horizon production)

Read-only lookups against **horizon-production transactional Postgres** during investigations (pairs with `investigatr-authoring` / `pup`).

## When to use

- Logs have `chart_id`, `teamId`, or `org_id` but **not** project/dashboard names or integer IDs.
- Confirm whether a chart is on a dashboard tab or orphaned (`dashboard_items`).
- Resolve tenant name vs team Firestore ID (`tenants.organization_id_fs`).
- Cross-check Datadog org auth noise (always verify chart `datasource_id` → `datasources.organization_id_fs`).

**Do not use** for INSERT/UPDATE/DELETE, Alembic migrations, or copying connection strings into docs/commits.

## DB URL without Secrets Manager (preferred)

The bundled script **does not call AWS by default**. Provide the URL once; reuse it for every query in the session.

**Option A — export for the shell session (best for agents):**

```bash
export BACKEND_DB_URL='postgresql://...'

~/.agents/skills/query-postgres-hz/scripts/query-postgres-hz.sh lookup-chart 526599
```

**Option B — local config file (best for humans):**

```bash
mkdir -p ~/.config/horizon-pg
# one line: the full postgresql:// URL (or BACKEND_DB_URL=...)
nano ~/.config/horizon-pg/backend_db_url
```

**Option C — Akkio worktree `ml/.env`:** if `BACKEND_DB_URL=` is already present there, the script reads it automatically (`AKKIO_REPO` defaults to `~/Akkio`).

Resolution order: `$BACKEND_DB_URL` → `$HORIZON_PG_URL` → env files above → `~/.cache/horizon-pg/<profile>.url` (24h cache from a prior `--from-secrets` run) → Secrets Manager **only with `--from-secrets`**.

No AWS calls means **no SSO browser prompts** for routine investigation queries.

## No AWS SSO login (agents — mandatory)

**Agents must never run `aws sso login`** (with or without `--profile`). That opens browser OAuth and spams the user.

If `--from-secrets` fails with auth/credentials errors (`Unable to locate credentials`, `Token has expired`, `Error when retrieving token from sso`, etc.):

1. **Stop.** Do not retry Secrets Manager, do not run `aws sso login`, do not loop.
2. **Tell the user** to authenticate manually in their own terminal, then either export `BACKEND_DB_URL` or re-run `--from-secrets`.
3. Wait for the user. Do not proceed until they confirm.

The bundled script never invokes `aws sso login` and prints `AUTH_REQUIRED:` on auth failures so agents know to hand off to the user.

## Read-only blacklist (mandatory)

This skill is **investigation read-only only**. Never run mutating SQL against production, even if the user asks casually.

**Always use the bundled script** for agents (`query-postgres-hz.sh`). It rejects SQL before connecting if it contains DML/DDL (`UPDATE`, `INSERT`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `COPY`, `DO`, `CALL`, etc.). Allowed statement starters: **`SELECT`**, **`WITH`**, **`EXPLAIN`**, **`SHOW`**, **`TABLE`**, **`VALUES`**.

If a query is blocked, stop and explain — do **not** bypass with raw `psql` unless the user explicitly requests a write path outside this skill.

## Prerequisites

1. **VPN / tunnel:** RDS is private. Connection timeout → fix network before retrying.
2. **Local tools:** `psql`, `python3`.
3. **`BACKEND_DB_URL` available locally** (see above). AWS is optional.

## Preferred workflow (agent)

1. Try Datadog/logs first (`pup`, request context). Use Postgres only for gaps.
2. Prefer `$BACKEND_DB_URL` or a local config file — no AWS unless the user explicitly okays `--from-secrets`.
3. **Never run `aws sso login`.** On `AUTH_REQUIRED:` or auth errors from Secrets Manager, stop and ask the user to log in manually.
4. Run lookups via the bundled script.

```bash
~/.agents/skills/query-postgres-hz/scripts/query-postgres-hz.sh lookup-chart 526599
```

5. Cite results as **Postgres query output**. Redact passwords if any connection error leaks a URL.

## Secrets Manager (opt-in fallback)

Only when no local URL exists. Run **once**, then rely on cache or `$BACKEND_DB_URL`:

```bash
~/.agents/skills/query-postgres-hz/scripts/query-postgres-hz.sh --from-secrets lookup-chart 526599
```

Secret: **`production/common/env`**, key **`BACKEND_DB_URL`**. See [secrets-and-access.md](references/secrets-and-access.md).

Valid AWS credentials must already be cached for `horizon-production`. If not, the user logs in manually — the agent does not.

## Schema gotchas

| Topic | Note |
|-------|------|
| Projects | Integer PK is often `projects.id` (e.g. `1109853`); `id_fs` may be **empty** — search by `id`, not only `id_fs`. |
| Charts | Table is `chart`, not `charts`. |
| Dashboard linkage | Prefer `dashboard_items.item->'chatChart'->>'chartId'`; `chart_metadata.dashboard_id` is often null for chat-created charts. |
| Tenants | `tenants.organization_id_fs` is the team Firestore ID; `tenants.id` is integer PK. |
| Soft delete | Filter `deleted_at IS NULL` on projects/dashboards/charts when checking current state. |

More SQL templates: [references/queries.md](references/queries.md).

## Failure modes

| Symptom | Action |
|---------|--------|
| `BACKEND_DB_URL not found locally` | Ask user to export it or write `~/.config/horizon-pg/backend_db_url`. Optional: user runs `--from-secrets` once after SSO is fresh. |
| `AUTH_REQUIRED:` / AWS auth errors | **Stop.** Tell user to run `aws sso login --profile horizon-production` in their terminal. Do not run it from the agent. Wait for confirmation. |
| `timeout expired` | Connect VPN/tunnel; retry. |
| `blocked mutating SQL` | Rewrite as SELECT-only or stop. |
| 0 rows for `id_fs = '1109853'` | Retry with `projects.id = 1109853` (numeric PK). |

## Self-check before citing in an investigation

- [ ] Queried the same chart/project ID seen in logs?
- [ ] Checked `dashboard_items`, not only `chart_metadata.dashboard_id`?
- [ ] Confirmed tenant via chart datasource org, not an unrelated org auth log line?
- [ ] Read-only SQL only?
- [ ] No secrets or full DB URLs in MDX/commits?
