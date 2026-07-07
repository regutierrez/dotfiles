#!/usr/bin/env bash
# Read-only Akkio Horizon transactional Postgres queries via psql (multi-env).
set -euo pipefail

ENV_NAME="${HORIZON_PG_ENV:-production}"
ENV_FROM_CLI=0
CONNECT_TIMEOUT="${HORIZON_PG_CONNECT_TIMEOUT:-10}"
USE_SECRETS="${HORIZON_PG_FROM_SECRETS:-0}"
CACHE_TTL_SECONDS="${HORIZON_PG_CACHE_TTL:-604800}"
MAX_LINES="${HORIZON_PG_MAX_LINES:-200}"
SECRET_ID_OVERRIDE="${HORIZON_PG_SECRET_ID:-}"

usage() {
  cat <<'EOF'
Usage:
  query-postgres-hz.sh envs                                # list envs: URL source, host, reachability
  query-postgres-hz.sh [flags] lookup-chart <chart_id>
  query-postgres-hz.sh [flags] lookup-project <project_id>
  query-postgres-hz.sh [flags] -c "<SQL>"
  query-postgres-hz.sh [flags] -f <file.sql>

Flags:
  --env production|staging|dev|local   target environment (default: $HORIZON_PG_ENV or production)
  --from-secrets                       allow AWS Secrets Manager fetch (profile horizon-<env>)
  --max-lines N                        cap psql output lines (default 200)

DB URL resolution per env (first match wins; no AWS unless --from-secrets):
  1. $BACKEND_DB_URL / $HORIZON_PG_URL   (ignored when --env is passed explicitly)
  2. ~/.config/horizon-pg/<env>.url
  3. ~/.cache/horizon-pg/horizon-<env>.url   (stale cache still used, with a warning)
  4. AWS Secrets Manager (--from-secrets only)
  --env local reads BACKEND_DB_URL from $AKKIO_REPO/ml/.env (default ~/Akkio/ml/.env).

Every query prints "env=... host=..." on stderr. All SQL is validated read-only
before connecting; the target host is TCP-checked first (UNREACHABLE fails fast).

Requires: python3, psql. aws CLI only for --from-secrets.
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
      --env)
        [[ $# -ge 2 ]] || die "--env requires a value (production|staging|dev|local)"
        ENV_NAME="$2"
        ENV_FROM_CLI=1
        shift 2
        ;;
      --from-secrets)
        USE_SECRETS=1
        shift
        ;;
      --max-lines)
        [[ $# -ge 2 && "$2" =~ ^[0-9]+$ ]] || die "--max-lines requires a number"
        MAX_LINES="$2"
        shift 2
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
  python3 - "$label" "$sql" <<'PY'
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


def strip_comments_and_literals(text: str) -> str:
    """Remove comments and quoted content so keyword checks only see SQL shape."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if ch == "-" and nxt == "-":
            while i < n and text[i] not in "\r\n":
                i += 1
            out.append(" ")
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            out.append(" ")
            continue
        if ch == "'":
            i += 1
            while i < n:
                if text[i] == "'" and i + 1 < n and text[i + 1] == "'":
                    i += 2
                    continue
                if text[i] == "'":
                    i += 1
                    break
                i += 1
            out.append("''")
            continue
        if ch == '"':
            i += 1
            while i < n:
                if text[i] == '"' and i + 1 < n and text[i + 1] == '"':
                    i += 2
                    continue
                if text[i] == '"':
                    i += 1
                    break
                i += 1
            out.append('""')
            continue
        if ch == "$":
            match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", text[i:])
            if match:
                tag = match.group(0)
                end = text.find(tag, i + len(tag))
                i = end + len(tag) if end != -1 else n
                out.append(" ")
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def fail(message: str) -> None:
    print(f"error: blocked mutating SQL in {label}: {message}", file=sys.stderr)
    raise SystemExit(1)


cleaned = strip_comments_and_literals(sql)
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

# Shared resolver: mode "resolve" prints the URL for $ENV_NAME on stdout,
# mode "envs" prints a reachability table for all envs.
run_resolver() {
  local mode="$1"
  python3 - "$mode" "$ENV_NAME" "$ENV_FROM_CLI" "$USE_SECRETS" "$CONNECT_TIMEOUT" "$CACHE_TTL_SECONDS" "$SECRET_ID_OVERRIDE" <<'PY'
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

mode = sys.argv[1]
env_name = sys.argv[2]
env_from_cli = sys.argv[3] == "1"
use_secrets = sys.argv[4] == "1"
connect_timeout = sys.argv[5]
cache_ttl = int(sys.argv[6])
secret_override = sys.argv[7]

ENVS = ("production", "staging", "dev", "local")
ENV_LINE = re.compile(r'^BACKEND_DB_URL=(?:"(.*)"|(.*))$')


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def note(message: str) -> None:
    print(message, file=sys.stderr)


def host_port(url: str) -> tuple[str, int]:
    parsed = urllib.parse.urlparse(url)
    return parsed.hostname or "?", parsed.port or 5432


def reachable(url: str, timeout: float = 3.0) -> bool:
    host, port = host_port(url)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


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


def read_url_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = ENV_LINE.match(line)
        if match:
            return match.group(1) or match.group(2)
        if line.startswith(("postgresql://", "postgres://")):
            return line
    return None


def config_path(env: str) -> Path:
    root = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    return Path(root) / "horizon-pg" / f"{env}.url"


def cache_path(env: str) -> Path:
    return Path.home() / ".cache" / "horizon-pg" / f"horizon-{env}.url"


def local_candidates() -> list[Path]:
    paths: list[Path] = []
    env_file = os.environ.get("HORIZON_PG_ENV_FILE")
    if env_file:
        paths.append(Path(env_file).expanduser())
    akkio_repo = Path(os.environ.get("AKKIO_REPO", str(Path.home() / "Akkio"))).expanduser()
    paths.append(akkio_repo / "ml" / ".env")
    return paths


def resolve_env(env: str) -> tuple[str | None, str]:
    """Return (url, source-label) without touching AWS."""
    if env == "local":
        for path in local_candidates():
            value = parse_env_file(path)
            if value:
                return value, f"env-file:{path}"
        return None, ""
    value = read_url_file(config_path(env))
    if value:
        return value, f"config:{config_path(env)}"
    path = cache_path(env)
    if path.is_file():
        text = path.read_text().strip()
        if text:
            stale = time.time() - path.stat().st_mtime > cache_ttl
            return text, f"cache{'(stale)' if stale else ''}:{path}"
    return None, ""


def fetch_from_secrets(env: str) -> str:
    profile = f"horizon-{env}"
    secret_id = secret_override or f"{env}/common/env"
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
            ["aws", "secretsmanager", "get-secret-value", "--secret-id", secret_id,
             "--query", "SecretString", "--output", "text"],
            check=False,
            capture_output=True,
            text=True,
            env={**os.environ, "AWS_PROFILE": profile},
        )
    except FileNotFoundError:
        die("aws CLI not found; install it or provide the URL locally")

    if proc.returncode != 0:
        err_raw = (proc.stderr or proc.stdout or "").strip()
        err = re.sub(r"://([^:/@]+):([^@/]+)@", r"://\1:***@", err_raw)
        if any(marker in err_raw.lower() for marker in auth_markers):
            die(
                f"AUTH_REQUIRED: AWS credentials for profile '{profile}' are missing or expired "
                f"({err}).\nAgent: do NOT run aws sso login. Ask the user to run manually:\n"
                f"  aws sso login --profile {profile}\n"
                "Then retry with --from-secrets, or export BACKEND_DB_URL."
            )
        die(
            f"failed to read secret {secret_id} with profile {profile} ({err}). "
            "If the secret id differs for this env, set HORIZON_PG_SECRET_ID."
        )

    try:
        obj = json.loads(proc.stdout)
    except json.JSONDecodeError:
        die(f"secret {secret_id} did not contain JSON")
    url = obj.get("BACKEND_DB_URL")
    if not url:
        die(f"BACKEND_DB_URL missing from secret {secret_id}")
    path = cache_path(env)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(url)
    return url


if mode == "envs":
    print(f"{'env':<11} {'source':<15} {'host':<62} reachable")
    for env in ENVS:
        url, source = resolve_env(env)
        if not url:
            hint = "(--from-secrets can fetch)" if env != "local" else "(no ml/.env)"
            print(f"{env:<11} {'-':<15} {'no URL found ' + hint:<62} -")
            continue
        host, port = host_port(url)
        label = source.split(":", 1)[0]
        print(f"{env:<11} {label:<15} {host + ':' + str(port):<62} {'yes' if reachable(url) else 'no'}")
    raise SystemExit(0)

# mode == "resolve"
if env_name not in ENVS:
    die(f"unknown --env {env_name!r} (expected: {', '.join(ENVS)})")

ambient = next(
    (os.environ[k].strip() for k in ("BACKEND_DB_URL", "HORIZON_PG_URL") if os.environ.get(k, "").strip()),
    None,
)

if ambient and not env_from_cli:
    url, source, label = ambient, "env:BACKEND_DB_URL", "custom"
else:
    if ambient and env_from_cli:
        note(f"note: ignoring exported BACKEND_DB_URL because --env {env_name} was passed")
    url, source = resolve_env(env_name)
    label = env_name
    if not url:
        if env_name == "local":
            die(
                "no BACKEND_DB_URL in ml/.env for --env local. "
                "Set AKKIO_REPO or HORIZON_PG_ENV_FILE, or pick another --env."
            )
        if use_secrets:
            url, source = fetch_from_secrets(env_name), "secrets"
        else:
            die(
                f"no URL found for env '{env_name}'. Options:\n"
                f"  - write it to ~/.config/horizon-pg/{env_name}.url\n"
                f"  - export BACKEND_DB_URL='postgresql://...'\n"
                f"  - re-run with --from-secrets (AWS profile horizon-{env_name}; needs fresh SSO)\n"
                "Run the 'envs' subcommand to see what is available."
            )

if "(stale)" in source:
    note(f"warning: cached URL is older than TTL ({source}); using it anyway — if auth fails, refresh with --from-secrets")

host, port = host_port(url)
if os.environ.get("HORIZON_PG_SKIP_PREFLIGHT") != "1" and not reachable(url):
    die(
        f"UNREACHABLE: {host}:{port} (env={label}) refused/timed out on TCP within 3s.\n"
        "This environment is likely not routed on the current VPN. Run the 'envs' subcommand "
        "to see which environments are reachable, then retry with --env <name> or ask the user. "
        "Do not retry this same environment."
    )

note(f"env={label} host={host} source={source.split(':', 1)[0]}")
print(with_timeout(url))
PY
}

cap_output() {
  awk -v max="$MAX_LINES" '
    NR <= max { print }
    NR == max + 1 { printf "... output truncated at %d lines (add LIMIT or pass --max-lines N)\n", max }
  '
}

run_psql() {
  local url sql_mode
  sql_mode="$1"
  shift

  if [[ "$sql_mode" == "-c" ]]; then
    assert_read_only_sql "inline SQL" "$1"
  elif [[ "$sql_mode" == "-f" ]]; then
    [[ -f "$1" ]] || die "SQL file not found: $1"
    assert_read_only_sql_file "$1"
  else
    die "internal error: unknown sql mode $sql_mode"
  fi

  url="$(run_resolver resolve)"
  psql "$url" -v ON_ERROR_STOP=1 -P pager=off "$sql_mode" "$1" | cap_output
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

  parse_global_flags "$@"
  if [[ ${#REPLY[@]} -lt 1 ]]; then
    usage
    exit 1
  fi
  set -- "${REPLY[@]}"

  case "$1" in
    -h|--help|help)
      usage
      ;;
    envs)
      run_resolver envs
      ;;
    lookup-chart)
      require_cmd psql
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh [--env <env>] lookup-chart <chart_id>"
      lookup_chart "$2"
      ;;
    lookup-project)
      require_cmd psql
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh [--env <env>] lookup-project <project_id>"
      lookup_project "$2"
      ;;
    -c)
      require_cmd psql
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh [--env <env>] -c \"<SQL>\""
      run_psql -c "$2"
      ;;
    -f)
      require_cmd psql
      [[ $# -eq 2 ]] || die "usage: query-postgres-hz.sh [--env <env>] -f <file.sql>"
      run_psql -f "$2"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
