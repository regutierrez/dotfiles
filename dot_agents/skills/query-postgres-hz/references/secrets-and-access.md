# Secrets and access

## Production transactional Postgres

| Field | Value |
|-------|-------|
| Host pattern | `horizon-production-transactional-db.cluster-*.us-east-1.rds.amazonaws.com` |
| Database | `postgres` |
| Connection var | `BACKEND_DB_URL` |

## Preferred: local URL (no AWS)

Avoid Secrets Manager for routine investigation queries. Provide the URL once:

```bash
export BACKEND_DB_URL='postgresql://...'
```

Or persist outside git:

```bash
mkdir -p ~/.config/horizon-pg
printf '%s\n' 'postgresql://...' > ~/.config/horizon-pg/backend_db_url
chmod 600 ~/.config/horizon-pg/backend_db_url
```

The bundled script also reads `BACKEND_DB_URL` from `$AKKIO_REPO/ml/.env` when present.

## Opt-in: AWS Secrets Manager

Use only when no local URL exists. **One fetch**, then reuse `$BACKEND_DB_URL` or the 24h cache at `~/.cache/horizon-pg/horizon-production.url`.

```bash
query-postgres-hz.sh --from-secrets lookup-chart 526599
```

| Field | Value |
|-------|-------|
| AWS profile | `horizon-production` |
| Secret ID | `production/common/env` |
| JSON key | `BACKEND_DB_URL` |

Manual fetch (human, once per session):

```bash
AWS_PROFILE=horizon-production aws secretsmanager get-secret-value \
  --secret-id production/common/env \
  --query SecretString --output text \
| python3 -c "import json,sys; print(json.load(sys.stdin)['BACKEND_DB_URL'])"
```

Then `export` that value. Do not log the full URL.

## AWS auth failures (agents)

The script and agents **must not** run `aws sso login`. Browser OAuth is user-only.

When `--from-secrets` fails because SSO/credentials are missing or expired, the script exits with `AUTH_REQUIRED:` and instructions for the **user** to run:

```bash
aws sso login --profile horizon-production
```

The agent should relay that message, stop, and wait.

## Network

RDS is not public. Fix VPN/tunnel before retrying on `timeout expired`.

## Safety

- **Read-only only.** The bundled script enforces a keyword blacklist before any connection.
- Never commit `BACKEND_DB_URL`, passwords, or secret JSON to git/MDX.
