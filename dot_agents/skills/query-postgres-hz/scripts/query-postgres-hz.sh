#!/usr/bin/env bash
# Read-only Horizon production Postgres queries via psql.
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-horizon-production}"
SECRET_ID="${HORIZON_PG_SECRET_ID:-production/common/env}"
CONNECT_TIMEOUT="${HORIZON_PG_CONNECT_TIMEOUT:-10}"
USE_SECRETS="${HORIZON_PG_FROM_SECRETS:-0}"
CACHE_TTL_SECONDS="${HORIZON_PG_CACHE_TTL:-86400}"

usage() {
  cat <<'EOF'
Usage:
  query-postgres-hz.sh [--from-secrets] lookup-chart <chart_id>
  query-postgres-hz.sh [--from-secrets] lookup-project <project_id>
  query-postgres-hz.sh [--from-secrets] -c "<SQL>"
  query-postgres-hz.sh [--from-secrets] -f <file.sql>

DB URL resolution (first match wins; no AWS unless --from-secrets):
  1. $BACKEND_DB_URL or $HORIZON_PG_URL
  2. BACKEND_DB_URL in $HORIZON_PG_ENV_FILE, $AKKIO_REPO/ml/.env, or ~/Akkio/ml/.env
  3. ~/.config/horizon-pg/backend_db_url (URL line or BACKEND_DB_URL=...)
  4. ~/.cache/horizon-pg/<AWS_PROFILE>.url (written by a prior --from-secrets run)
  5. AWS Secrets Manager (only with --from-secrets or HORIZON_PG_FROM_SECRETS=1)

Requires: python3, psql, VPN to horizon-production RDS. aws CLI only for --from-secrets.

All SQL is validated read-only before connect. Mutating keywords are rejected.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

parse_global_flags() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from-secrets)
        USE_SECRETS=1
        shift
        ;;
      *)
        break
        ;;
    esac
  done
  REPLY=("$@")
}

assert_read_only_sql() {
  local label="$1"
  local sql="$2"
  python3 - <<'PY' "$label" "$sql"
import re
import sys

label = sys.argv[1]
sql = sys.argv[2]

FORBIDDEN = (
    "insert", "update", "delete", "merge", "upsert",
    "create", "alter", "drop", "truncate", "rename",
    "grant", "revoke",
    "copy",
    "vacuum", "reindex", "cluster",
    "refresh",
    "do", "call",
    "lock",
    "prepare", "execute",
    "discard", "notify", "listen",
    "set", "reset",
)

ALLOWED_STARTS = ("select", "with", "explain", "show", "table", "values")
ALLOWED_PSQL_META = {"x", "timing", "pset", "a", "t", "c", "o", "q", "echo", "conninfo"}


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"--[^\n]*", " ", text)
    return text


def fail(message: str) -> None:
    print(f"error: blocked mutating SQL in {label}: {message}", file=sys.stderr)
    raise SystemExit(1)


cleaned = strip_comments(sql)
lower = cleaned.lower()

for line in sql.splitlines():
    stripped = line.strip()
    if not stripped.startswith("\\"):
        continue
    cmd = stripped[1:].split()[0].lower() if len(stripped) > 1 else ""
    if cmd not in ALLOWED_PSQL_META:
        fail(f"psql meta-command \\{cmd} is not allowed (read-only skill)")

for keyword in FORBIDDEN:
    if re.search(rf"\b{keyword}\b", lower):
        fail(f"keyword {keyword.upper()} is blacklisted")

for stmt in (part.strip() for part in cleaned.split(";")):
    if not stmt:
        continue
    match = re.match(r"^\s*(\w+)", stmt, re.I)
    if not match:
        continue
    start = match.group(1).lower()
    if start not in ALLOWED_STARTS:
        allowed = ", ".join(word.upper() for word in ALLOWED_STARTS)
        fail(f"statement starts with {start.upper()} (allowed: {allowed})")
PY
}

assert_read_only_sql_file() {
  local file="$1"
  assert_read_only_sql "$file" "$(cat "$file")"
}

resolve_backend_db_url() {
  python3 - <<'PY' "$USE_SECRETS" "$AWS_PROFILE" "$SECRET_ID" "$CONNECT_TIMEOUT" "$CACHE_TTL_SECONDS"
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

use_secrets = sys.argv[1] == "1"
aws_profile = sys.argv[2]
secret_id = sys.argv[3]
connect_timeout = sys.argv[4]
cache_ttl = int(sys.argv[5])

ENV_LINE = re.compile(r'^BACKEND_DB_URL=(?:"(.*)"|(.*))$')


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def with_timeout(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    query["connect_timeout"] = [connect_timeout]
    new_query = urllib.parse.urlencode({k: v[0] for k, v in query.items()})
    return urllib.parse.urlunparse(parsed._replace(query=new_query))


def parse_env_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text().splitlines():
        match = ENV_LINE.match(line.strip())
        if match:
            return match.group(1) or match.group(2)
    return None


def read_config_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    text = path.read_text().strip()
    if not text or text.startswith("#"):
        return None
    match = ENV_LINE.match(text.splitlines()[0].strip())
    if match:
        return match.group(1) or match.group(2)
    if text.startswith("postgresql://") or text.startswith("postgres://"):
        return text.splitlines()[0].strip()
    return None


def cache_path() -> Path:
    cache_dir = Path.home() / ".cache" / "horizon-pg"
    cache_dir.mkdir(parents=True, exist_ok=True)
    safe_profile = re.sub(r"[^A-Za-z0-9._-]+", "_", aws_profile)
    return cache_dir / f"{safe_profile}.url"


def read_cache() -> str | None:
    path = cache_path()
    if not path.is_file():
        return None
    age = time.time() - path.stat().st_mtime
    if age > cache_ttl:
        return None
    text = path.read_text().strip()
    return text or None


def write_cache(url: str) -> None:
    cache_path().write_text(url)


def local_candidates() -> list[Path]:
    paths: list[Path] = []
    env_file = os.environ.get("HORIZON_PG_ENV_FILE")
    if env_file:
        paths.append(Path(env_file).expanduser())
    akkio_repo = Path(os.environ.get("AKKIO_REPO", Path.home() / "Akkio")).expanduser()
    paths.append(akkio_repo / "ml" / ".env")
    config_root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    paths.append(config_root / "horizon-pg" / "backend_db_url")
    return paths


def resolve_local() -> str | None:
    for key in ("BACKEND_DB_URL", "HORIZON_PG_URL"):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    for path in local_candidates():
        if path.name == "backend_db_url":
            value = read_config_file(path)
        else:
            value = parse_env_file(path)
        if value:
            return value
    return read_cache()


def fetch_from_secrets() -> str:
    auth_markers = (
        "unable to locate credentials",
        "token has expired",
        "error when retrieving token from sso",
        "sso session",
        "expired",
        "not authorized",
        "unauthorized",
        "accessdenied",
        "access denied",
        "invalidclienttokenid",
        "security token included in the request is invalid",
    )

    try:
        proc = subprocess.run(
            [
                "aws",
                "secretsmanager",
                "get-secret-value",
                "--secret-id",
                secret_id,
                "--query",
                "SecretString",
                "--output",
                "text",
            ],
            check=False,
            capture_output=True,
            text=True,
            env={**os.environ, "AWS_PROFILE": aws_profile},
        )
    except FileNotFoundError:
        die("aws CLI not found; install it or provide BACKEND_DB_URL locally")

    if proc.returncode != 0:
        err_raw = (proc.stderr or proc.stdout or "").strip()
        err = re.sub(r"://([^:/@]+):([^@/]+)@", r"://\\1:***@", err_raw)
        err_lower = err_raw.lower()
        if any(marker in err_lower for marker in auth_markers):
            die(
                "AUTH_REQUIRED: AWS credentials for profile "
                f"'{aws_profile}' are missing or expired ({err.strip()}).\n"
                "Agent: do NOT run aws sso login. Ask the user to run manually:\n"
                f"  aws sso login --profile {aws_profile}\n"
                "Then export BACKEND_DB_URL or retry with --from-secrets."
            )
        die(
            "failed to read secret "
            f"{secret_id} ({err.strip()}). "
            "Prefer exporting BACKEND_DB_URL once instead of using --from-secrets."
        )

    try:
        obj = json.loads(proc.stdout)
    except json.JSONDecodeError:
        die(f"secret {secret_id} did not contain JSON")

    url = obj.get("BACKEND_DB_URL")
    if not url:
        die(f"BACKEND_DB_URL missing from secret {secret_id}")
    write_cache(url)
    return url


url = resolve_local()
if not url:
    if use_secrets:
        url = fetch_from_secrets()
    else:
        die(
            "BACKEND_DB_URL not found locally. Set one of:\n"
            "  export BACKEND_DB_URL='postgresql://...'\n"
            "  echo 'postgresql://...' > ~/.config/horizon-pg/backend_db_url\n"
            "  (or populate BACKEND_DB_URL in ~/Akkio/ml/.env)\n"
            "Or pass --from-secrets once to fetch from AWS and cache for 24h."
        )

print(with_timeout(url))
PY
}

run_psql() {
  local url sql_mode sql_arg
  url="$(resolve_backend_db_url)"
  sql_mode="$1"
  shift

  if [[ "$sql_mode" == "-c" ]]; then
    sql_arg="$1"
    assert_read_only_sql "inline SQL" "$sql_arg"
    psql "$url" -v ON_ERROR_STOP=1 -c "$sql_arg"
  elif [[ "$sql_mode" == "-f" ]]; then
    [[ -f "$1" ]] || die "SQL file not found: $1"
    assert_read_only_sql_file "$1"
    psql "$url" -v ON_ERROR_STOP=1 -f "$1"
  else
    die "internal error: unknown sql mode $sql_mode"
  fi
}

lookup_chart() {
  local chart_id="$1"
  [[ "$chart_id" =~ ^[0-9]+$ ]] || die "chart_id must be numeric"

  run_psql -c "
SELECT '=== chart + datasource ===' AS section;
SELECT c.id AS chart_id,
       cm.id AS metadata_id,
       cm.title,
       cm.dashboard_id AS metadata_dashboard_id,
       cm.code_hash,
       ds.id AS datasource_id,
       ds.name AS datasource_name,
       ds.organization_id_fs AS datasource_org
FROM chart c
JOIN chart_metadata cm ON c.chart_metadata_id = cm.id
LEFT JOIN datasources ds ON ds.id = cm.datasource_id
WHERE c.id = ${chart_id} AND c.deleted_at IS NULL;

SELECT '=== dashboard_items ===' AS section;
SELECT (di.item->'chatChart'->>'chartId')::int AS chart_id,
       cm.title,
       di.dashboard_id,
       d.name AS dashboard_name,
       d.project_id_fs,
       d.deleted_at AS dashboard_deleted_at
FROM dashboard_items di
JOIN dashboards d ON d.id = di.dashboard_id
LEFT JOIN chart c ON c.id = (di.item->'chatChart'->>'chartId')::int
LEFT JOIN chart_metadata cm ON cm.id = c.chart_metadata_id
WHERE di.deleted_at IS NULL
  AND di.item ? 'chatChart'
  AND (di.item->'chatChart'->>'chartId')::int = ${chart_id};

SELECT '=== code_hash clones ===' AS section;
SELECT c.id AS chart_id, cm.id AS metadata_id, cm.title
FROM chart c
JOIN chart_metadata cm ON c.chart_metadata_id = cm.id
WHERE cm.code_hash = (
  SELECT cm2.code_hash
  FROM chart c2
  JOIN chart_metadata cm2 ON c2.chart_metadata_id = cm2.id
  WHERE c2.id = ${chart_id}
)
AND c.deleted_at IS NULL
ORDER BY c.id;

SELECT '=== tenant (from datasource org) ===' AS section;
SELECT t.id AS tenant_pk, t.name AS tenant_name, t.organization_id_fs AS team_id
FROM chart c
JOIN chart_metadata cm ON c.chart_metadata_id = cm.id
JOIN datasources ds ON ds.id = cm.datasource_id
JOIN tenants t ON t.organization_id_fs = ds.organization_id_fs
WHERE c.id = ${chart_id};
"
}

lookup_project() {
  local project_id="$1"
  [[ "$project_id" =~ ^[0-9]+$ ]] || die "project_id must be numeric"

  run_psql -c "
SELECT '=== project ===' AS section;
SELECT id, id_fs, name, type, deleted_at
FROM projects
WHERE id = ${project_id} OR id_fs = '${project_id}';

SELECT '=== dashboards ===' AS section;
SELECT d.id AS dashboard_id,
       d.name AS dashboard_name,
       d.deleted_at,
       t.id AS tenant_pk,
       t.name AS tenant_name,
       t.organization_id_fs AS team_id,
       (SELECT count(*)
        FROM dashboard_items di
        WHERE di.dashboard_id = d.id
          AND di.deleted_at IS NULL
          AND di.item ? 'chatChart') AS chart_items
FROM dashboards d
LEFT JOIN tenants t ON t.id = d.tenant_id
WHERE d.project_id_fs = '${project_id}'
ORDER BY d.id;
"
}

main() {
  require_cmd python3
  require_cmd psql

  local -a args
  parse_global_flags "$@"
  args=("${REPLY[@]}")

  if [[ ${#args[@]} -lt 1 ]]; then
    usage
    exit 1
  fi

  set -- "${args[@]}"

  case "$1" in
    -h|--help|help)
      usage
      ;;
    lookup-chart)
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh lookup-chart <chart_id>"
      lookup_chart "$2"
      ;;
    lookup-project)
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh lookup-project <project_id>"
      lookup_project "$2"
      ;;
    -c)
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh -c \"<SQL>\""
      run_psql -c "$2"
      ;;
    -f)
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh -f <file.sql>"
      run_psql -f "$2"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
