---
name: query-postgres-hz
description: Read-only SQL against Akkio Horizon transactional Postgres (production/staging/dev/local) via a guarded psql wrapper with --env selection. Use for investigation lookups (chart→project/dashboard/tenant IDs) missing from Datadog/logs. Run its `envs` subcommand first to see which environments are reachable and how they route. No writes; agents never run aws sso login.
compatibility: Requires python3. Host/local queries require psql; Docker VPN sidecar queries require docker and a postgres client image. aws CLI only for --from-secrets.
disable-model-invocation: true
---

# Query Postgres (Horizon)

Guarded read-only lookups against Horizon transactional Postgres, one script for all environments.

```bash
S=~/.agents/skills/query-postgres-hz/scripts/query-postgres-hz.sh
$S envs                                  # ALWAYS FIRST: URL source + reachability per env
$S --env staging lookup-chart 526599     # chart → datasource/dashboards/tenant bundle
$S --env staging lookup-project 1109853  # project → dashboards bundle
$S --env staging -c "SELECT ..."         # ad-hoc read-only SQL
```

Flags: `--env production|staging|dev|local` (default `$HORIZON_PG_ENV`, else `production`) · `--from-secrets` (opt-in AWS fetch) · `--max-lines N` (output cap, default 200 — add `LIMIT` to queries anyway).

## Environment discipline

- **Run `envs` before the first query of a session.** It shows, per environment, URL source, route (`host` or `sidecar:<container>`), and TCP reachability. Production/staging auto-use running Docker VPN sidecars named `vpn-horizon-production` / `vpn-horizon-staging`; override with `HORIZON_PG_SIDECAR_<ENV>` or `~/.config/horizon-pg/<env>.sidecar`. Local and ambient exported URLs stay on the host route.
- Every query prints `env=<name> host=<host>` on stderr — confirm it matches the environment you intend before citing results. Production data questions need `--env production`; do not substitute staging results silently.
- URL resolution per env: exported `BACKEND_DB_URL` (ignored when `--env` is passed explicitly and host-routed only when used as the ambient/custom URL) → `~/.config/horizon-pg/<env>.url` → `~/.cache/horizon-pg/horizon-<env>.url` (stale cache is still used, with a warning) → Secrets Manager only with `--from-secrets` (profile `horizon-<env>`, secret `<env>/common/env`).
- `--env local` is the only path that reads `$AKKIO_REPO/ml/.env` (default `~/Akkio/ml/.env`, usually `localhost:5431`).

## Hard rules

- **Read-only.** The script rejects DML/DDL/session-control before connecting (allowed starters: SELECT, WITH, EXPLAIN, SHOW, TABLE, VALUES; string literals are ignored by the check). If blocked, rewrite or stop — never bypass with raw psql.
- **Never run `aws sso login`.** On `AUTH_REQUIRED:` stop and ask the user to run `aws sso login --profile horizon-<env>` themselves.
- Never paste full DB URLs or passwords into chat, docs, or commits.

## Failure → action (do not loop)

| Output | Action |
|---|---|
| `UNREACHABLE: <host>` | Env not reachable on its displayed route. Run `envs`; if production/staging should use a sidecar, confirm the matching `vpn-horizon-<env>` container is running or set `HORIZON_PG_SIDECAR_<ENV>`. Use another reachable env only if it answers the question; otherwise ask the user. **Never retry the same env unchanged.** |
| `no URL found for env ...` | Follow the options the error prints; `--from-secrets` only with user's okay. |
| `AUTH_REQUIRED:` | Stop. User must run SSO login manually; wait for confirmation. |
| `password authentication failed` | Cached URL outdated → one `--from-secrets` run (with user's okay) refreshes it. |
| stale-cache warning on stderr | Informational — proceed; refresh only if auth then fails. |
| `blocked mutating SQL` | Rewrite as SELECT-only or stop. |
| 0 rows for `id_fs = 'N'` | Retry with `projects.id = N` (integer PK). |

## Schema gotchas

| Topic | Note |
|---|---|
| Projects | Integer PK `projects.id`; `id_fs` may be empty — search by `id` too. |
| Charts | Table is `chart`, not `charts`. |
| Dashboard linkage | Prefer `dashboard_items.item->'chatChart'->>'chartId'`; `chart_metadata.dashboard_id` is often null for chat-created charts. |
| Tenants | `tenants.organization_id_fs` = team Firestore ID; `tenants.id` = integer PK. |
| Soft delete | Filter `deleted_at IS NULL` on projects/dashboards/charts. |

SQL templates: [references/queries.md](references/queries.md) · secrets/access details: [references/secrets-and-access.md](references/secrets-and-access.md)
