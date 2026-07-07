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

RDS hosts are private; VPN typically routes only some environments. The script TCP-checks the host before connecting and fails fast with `UNREACHABLE:` — run the `envs` subcommand to see what is currently routed instead of retrying.

## Safety

- Read-only only; the script enforces a keyword blacklist (string-literal aware) before connecting.
- Never commit `BACKEND_DB_URL`, passwords, or secret JSON to git/MDX.
