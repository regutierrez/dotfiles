# Secrets and access

## Environments

| Env | RDS host pattern | AWS profile | Secret ID (default) |
|---|---|---|---|
| production | `horizon-production-transactional-db.cluster-*.us-east-1.rds.amazonaws.com` | `horizon-production` | `production/common/env` |
| staging | `horizon-staging-transactional-db.cluster-*...` | `horizon-staging` | `staging/common/env` |
| dev | `horizon-dev-transactional-db.cluster-*...` | `horizon-dev` | `dev/common/env` |
| local | `localhost:5431` from `~/Akkio/ml/.env` | — | — |

Database is `postgres`; the connection var inside each secret is `BACKEND_DB_URL`. If a secret ID differs from the default pattern, override with `HORIZON_PG_SECRET_ID`.

## Preferred: local URL (no AWS)

Persist a URL per environment outside git (the script prefers this over caches):

```bash
mkdir -p ~/.config/horizon-pg
printf '%s\n' 'postgresql://...' > ~/.config/horizon-pg/staging.url
chmod 600 ~/.config/horizon-pg/*.url
```

Or export `BACKEND_DB_URL` for a one-off session (skipped when `--env` is passed explicitly).

## Cache

`--from-secrets` writes `~/.cache/horizon-pg/horizon-<env>.url`. The script reuses the cache even past its TTL (default 7 days, `HORIZON_PG_CACHE_TTL` seconds) with a warning, because DB passwords rotate rarely — refresh only when auth actually fails.

## Opt-in: AWS Secrets Manager

```bash
query-postgres-hz.sh --env staging --from-secrets -c "SELECT 1"
```

Manual fetch (human, once):

```bash
AWS_PROFILE=horizon-staging aws secretsmanager get-secret-value \
  --secret-id staging/common/env --query SecretString --output text \
| python3 -c "import json,sys; print(json.load(sys.stdin)['BACKEND_DB_URL'])"
```

## AWS auth failures (agents)

Agents must not run `aws sso login` (browser OAuth is user-only). On `AUTH_REQUIRED:` the agent relays the message, stops, and waits for the user to run:

```bash
aws sso login --profile horizon-<env>
```

## Network

RDS hosts are private. Dev, staging, and production always route through Tailscale Serve on `akkio-remote`, not a local Docker VPN sidecar or SSH loopback forward:

| Env | Serve port |
|---|---|
| dev | `15432` |
| staging | `25432` |
| production | `35432` |

Gateway hostname, first match:

1. `HORIZON_PG_GATEWAY`
2. `GATEWAY=` in `~/.config/akkio-vpn/client.conf`
3. `akkio-remote.atlas-cherimoya.ts.net`

The script rewrites the resolved URL host and port onto that listener before connecting. Cached RDS `:5432` URLs and `localhost:<serve-port>` URLs both become `gateway:<serve-port>`.

`local` and ambient exported URLs (`BACKEND_DB_URL` / `HORIZON_PG_URL` without `--env`) stay on the host route.

The script TCP-checks the Serve listener before connecting and fails fast with `UNREACHABLE:` — run the `envs` subcommand to see route + reachability instead of retrying. Do not start local Docker sidecars or SSH forwards; ask the user to check Tailscale / `akkio-vpn doctor`.

## Safety

- Read-only only; the script enforces a keyword blacklist (string-literal aware) before connecting.
- Never commit `BACKEND_DB_URL`, passwords, or secret JSON to git/MDX.
