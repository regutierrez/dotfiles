# Akkio — create worktree

Akkio-specific rules on top of the parent skill's create flow (`wt switch --create`, path resolution, failure handling). Repo root: `~/Akkio`. Create with `-C ~/Akkio`; use `--base` for release branches (e.g. `release/horizon-staging`).

**Two layers** (do not conflate):

1. **Docker infra** — `wt-stack` (never `mise run docker:services`).
2. **App processes** — `mise run services:<name> -- up` (never bare `mise run services -- up` on isolated stacks).

Docs: `$HOME/repos/akkio-dev-stacks/README.md`, `wt-stack/README.md`, `vpn-sidecar/README.md`.

## Prerequisites (one-time per machine)

```sh
command -v wt-stack    # cd ~/repos/akkio-dev-stacks/wt-stack && go install .
```

`~/.akkio/wt-stack/config.json` — absolute `vpn_dir` pointing at `akkio-dev-stacks/vpn-sidecar`.

VPN sidecar (Horizon remote Postgres): `brew install socat`, run `vpn-sidecar/setup.sh`, keep `auth-watch.sh` running when sidecars are up. Loopback ports: dev `15432`, staging `25432`, production `35432`.

## Branch name

Prefix `pael-akkio/<slug>`. Slug: **6–8 hyphenated words (and linear ID if provided or mentioned in the session)** from the task unless the user supplied one. Horizon slugs should include `horizon-dev`, `horizon-staging`, or `horizon-production` when relevant (helps `wt-stack up --vpn` infer the tunnel).

## Stack profile — ask before create

Unless the user already stated their stack, **ask which profile fits the work** before `wt switch --create`. Do not guess `web-only` vs `full-web-ml`.

| If they're doing… | Dev mode | Local wt-stack? | App services |
|---|---|---|---|
| Frontend-only against a remote env (no local backend/ML) | `ui-only` | No | `services:web` |
| Frontend + web-backend (local auth/deps, no ML/workers) | `web-only` | Yes — pg, keycloak, redis, rabbitmq | `services:web`, `services:web-backend` |
| Full local stack (ML, celery/temporal workers, local DB workflows) | `full-web-ml` | Yes — above + temporal (or full compose) | above + `services:ml-backend`, `services:workers` |

Also nail down **agency/env or profile** when obvious from the task (e.g. Horizon staging → `--agency horizon --env staging`). If unclear, ask in the same confirmation turn as the stack question.

Summarize branch + stack + profile back to the user; get approval before creating the worktree.

## Bootstrap

Run inside `<worktree_path>` after create.

### Setup (deps + env)

```sh
mise trust
mise run worktree:setup -- --agency <key> --env <key> --mode <ui-only|web-only|full-web-ml> [--profile <name>] [--postgres local|remote] [--silent]
```

`worktree:setup` may start the legacy shared Docker stack — ignore it; wt-stack is this worktree's infra.

### VPN (Horizon remote Postgres)

When profile/agency needs private remote DB:

1. `auth-watch.sh` running.
2. Sidecar only (`ui-only`): `docker compose up -d horizon-<env>` in `vpn-sidecar/`.
3. Local stack + VPN: same tunnel via `wt-stack up --vpn=horizon-<env> …` (step below).
4. `aws sso login --profile horizon-<env>`.
5. Never `mise run vpn:up` while that env's sidecar is connected.

### wt-stack (skip for `ui-only`)

| Dev mode | Services |
|---|---|
| `web-only` | `akkio-pg-db-backend akkio-keycloak akkio-redis akkio-rabbitmq` |
| `full-web-ml` | above + `akkio-temporal` (or `wt-stack up` for full branch compose) |

```sh
wt-stack up [ --vpn=horizon-<env> ] <services…>
wt-stack wire && wt-stack wire --write
wt-stack map && wt-stack ps
```

`wire --write` repoints `ml/.env`, `apps/web-backend-api/.env`, `dev-config.json` to shifted ports. Remote DB via sidecar: confirm `BACKEND_DB_URL` uses loopback `15432`/`25432`/`35432` — `wire` only shifts canonical local compose ports.

### App processes

Per-service only, after `wire --write`:

```sh
# web-only
mise run services:web -- up
mise run services:web-backend -- up

# full-web-ml — add:
mise run services:ml-backend -- up
mise run services:workers -- up
```

### Agent overrides

```sh
"$HOME/repos/akkio-agent-overrides/bin/akkio-bootstrap" <worktree_path>
"$HOME/.local/bin/akkio-overrides-visibility" hide <worktree_path>
```

### Avoid on isolated stacks

- `mise run docker:services -- up|down`
- `mise run services -- up`
- `mise run vpn:up` with sidecar up
- `docker restart akkio-keycloak` — use `wt-<worktree>-…` from `wt-stack ps`
- `mise run db:*` against local pg until `BACKEND_DB_URL` wiring is verified

## Report (Akkio fields)

Add to the parent skill's report:

- chosen stack profile (`ui-only` / `web-only` / `full-web-ml`) and profile/agency
- VPN sidecar env + SAML status (if any)
- wt-stack ports (`wt-stack map`) or "no local stack"
- `wire --write` applied
- services started
- overrides done
- app URL from `mise run worktree:status`
