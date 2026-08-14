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

RDS hosts are private. Production/staging can route through simultaneous Docker VPN sidecars instead of the host VPN:

- default sidecar container names: `vpn-horizon-production`, `vpn-horizon-staging`
- override per env with `HORIZON_PG_SIDECAR_PRODUCTION` / `HORIZON_PG_SIDECAR_STAGING`, or `~/.config/horizon-pg/<env>.sidecar`
- client image defaults to `postgres:16`; override with `HORIZON_PG_CLIENT_IMAGE`
- production/staging use their sidecar when it is running, even if the configured URL host is `localhost`
- when a sidecar-routed URL points at a published host port like `localhost:25432`, the script maps it back to the matching in-container port before running the postgres client
- local and ambient exported URLs (`BACKEND_DB_URL` / `HORIZON_PG_URL` without `--env`) stay on the host route

The script TCP-checks the configured URL on the selected route before connecting and fails fast with `UNREACHABLE:` — run the `envs` subcommand to see route + reachability instead of retrying.

## Safety

- Read-only only; the script enforces a keyword blacklist (string-literal aware) before connecting.
- Never commit `BACKEND_DB_URL`, passwords, or secret JSON to git/MDX.
