#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml", "snowflake-connector-python"]
# ///
"""Read-only Snowflake query runner backed by ~/.dbt/profiles.yml.

Run with:
  uv run ~/.agents/skills/query-snowflake-hz/scripts/query-snowflake-hz.py --sql "select current_version()"
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable

import snowflake.connector
import yaml

DEFAULT_PROFILE = "blushift"
DEFAULT_TARGET = "prod"
DEFAULT_SCHEMA = "BLUSHIFT_DEMO"
DEFAULT_TIMEOUT_SECONDS = 600
DEFAULT_MAX_ROWS = 50
DEFAULT_LOGIN_TIMEOUT_SECONDS = 20

ALLOWED_STARTERS = {"SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC", "TABLE", "VALUES"}
BLOCKED_ANYWHERE = {
    "ALTER",
    "BEGIN",
    "CALL",
    "COMMIT",
    "COPY",
    "CREATE",
    "DELETE",
    "DROP",
    "EXEC",
    "EXECUTE",
    "GRANT",
    "INSERT",
    "MERGE",
    "PUT",
    "REMOVE",
    "REVOKE",
    "ROLLBACK",
    "SET",
    "TO_QUERY",
    "TRUNCATE",
    "UNDROP",
    "UNSET",
    "UPDATE",
    "USE",
}


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def resolve_env_var_template(value: Any) -> Any:
    """Resolve simple dbt env_var() template strings without evaluating Jinja."""
    if not isinstance(value, str):
        return value
    full = re.fullmatch(
        r"\s*\{\{\s*env_var\(\s*['\"]([^'\"]+)['\"]\s*(?:,\s*['\"]([^'\"]*)['\"]\s*)?\)\s*\}\}\s*",
        value,
    )
    if not full:
        return value
    name, default = full.groups()
    if name in os.environ:
        return os.environ[name]
    if default is not None:
        return default
    raise SystemExit(f"Environment variable required by profiles.yml is not set: {name}")


def load_profile(path: Path, profile: str, target: str | None) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"profiles.yml not found: {path}")
    profiles = yaml.safe_load(path.read_text()) or {}
    if profile not in profiles:
        raise SystemExit(f"Profile {profile!r} not found in {path}")
    profile_cfg = profiles[profile] or {}
    outputs = profile_cfg.get("outputs") or {}
    selected_target = target or profile_cfg.get("target") or DEFAULT_TARGET
    if selected_target not in outputs:
        raise SystemExit(
            f"Target {selected_target!r} not found for profile {profile!r}. Available: {', '.join(outputs.keys())}"
        )
    cfg = {k: resolve_env_var_template(v) for k, v in (outputs[selected_target] or {}).items()}
    if cfg.get("type") != "snowflake":
        raise SystemExit(f"Profile {profile}.{selected_target} is not type: snowflake")
    return cfg


def strip_comments_and_literals(sql: str) -> str:
    """Keep SQL shape/keywords while removing comments and quoted content."""
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""
        if ch == "-" and nxt == "-":
            i += 2
            while i < n and sql[i] not in "\r\n":
                i += 1
            out.append(" ")
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (sql[i] == "*" and sql[i + 1] == "/"):
                i += 1
            i += 2
            out.append(" ")
            continue
        if ch == "'":
            i += 1
            while i < n:
                if sql[i] == "'" and i + 1 < n and sql[i + 1] == "'":
                    i += 2
                    continue
                if sql[i] == "'":
                    i += 1
                    break
                i += 1
            out.append("''")
            continue
        if ch == '"':
            i += 1
            while i < n:
                if sql[i] == '"' and i + 1 < n and sql[i + 1] == '"':
                    i += 2
                    continue
                if sql[i] == '"':
                    i += 1
                    break
                i += 1
            out.append('""')
            continue
        if ch == "$" and nxt == "$":
            i += 2
            while i + 1 < n and not (sql[i] == "$" and sql[i + 1] == "$"):
                i += 1
            i += 2
            out.append("$$")
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def split_nonempty_statements(cleaned_sql: str) -> list[str]:
    return [part.strip() for part in cleaned_sql.split(";") if part.strip()]


def first_word(sql: str) -> str:
    stripped = sql.strip()
    while stripped.startswith("("):
        stripped = stripped[1:].lstrip()
    match = re.match(r"([A-Za-z_][A-Za-z0-9_$]*)", stripped)
    return match.group(1).upper() if match else ""


def validate_read_only(sql: str) -> str:
    cleaned = strip_comments_and_literals(sql)
    statements = split_nonempty_statements(cleaned)
    if len(statements) != 1:
        raise SystemExit("Blocked: provide exactly one read-only SQL statement")
    statement = statements[0]
    starter = first_word(statement)
    if starter not in ALLOWED_STARTERS:
        raise SystemExit(
            f"Blocked: SQL must start with one of {', '.join(sorted(ALLOWED_STARTERS))}; got {starter or '<empty>'}"
        )
    tokens = set(re.findall(r"\b[A-Za-z_][A-Za-z0-9_$]*\b", statement.upper()))
    blocked = sorted(tokens & BLOCKED_ANYWHERE)
    if blocked:
        raise SystemExit(f"Blocked: mutating or session-control keyword(s) found: {', '.join(blocked)}")
    if "SYSTEM$" in statement.upper():
        raise SystemExit("Blocked: SYSTEM$ functions can have side effects and are not allowed")
    return sql.strip().rstrip(";")


def read_sql(args: argparse.Namespace) -> str:
    sources = sum(bool(x) for x in [args.sql, args.file, not sys.stdin.isatty()])
    if sources == 0:
        raise SystemExit("Provide SQL with --sql, --file, or stdin")
    if args.sql and args.file:
        raise SystemExit("Use only one SQL source: --sql or --file")
    if args.sql:
        return args.sql
    if args.file:
        return Path(args.file).read_text()
    return sys.stdin.read()


def connect_args_from_profile(cfg: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    known_keys = {
        "account",
        "user",
        "password",
        "warehouse",
        "database",
        "schema",
        "role",
        "authenticator",
        "private_key",
        "private_key_path",
        "token",
    }
    conn_args = {k: v for k, v in cfg.items() if k in known_keys and v not in (None, "")}
    conn_args["login_timeout"] = DEFAULT_LOGIN_TIMEOUT_SECONDS
    conn_args["network_timeout"] = args.timeout
    for key in ["warehouse", "database", "schema", "role"]:
        override = getattr(args, key)
        if override:
            conn_args[key] = override
    if "schema" not in conn_args or not conn_args["schema"]:
        conn_args["schema"] = DEFAULT_SCHEMA
    required = ["account", "user"]
    missing = [k for k in required if not conn_args.get(k)]
    if missing:
        raise SystemExit(f"Missing Snowflake connection field(s) in profiles.yml: {', '.join(missing)}")
    return conn_args


def rows_as_dicts(columns: list[str], rows: Iterable[tuple[Any, ...]]) -> list[dict[str, Any]]:
    return [dict(zip(columns, row, strict=False)) for row in rows]


def emit_csv(columns: list[str], rows: list[tuple[Any, ...]], delimiter: str = ",") -> None:
    writer = csv.writer(sys.stdout, delimiter=delimiter)
    writer.writerow(columns)
    writer.writerows(rows)


def emit_table(columns: list[str], rows: list[tuple[Any, ...]]) -> None:
    string_rows = [["" if value is None else str(value) for value in row] for row in rows]
    widths = [len(col) for col in columns]
    for row in string_rows:
        widths = [max(widths[i], min(len(row[i]), 80)) for i in range(len(columns))]
    fmt = " | ".join("{:<" + str(w) + "}" for w in widths)
    print(fmt.format(*columns))
    print("-+-".join("-" * w for w in widths))
    for row in string_rows:
        clipped = [cell if len(cell) <= 80 else cell[:77] + "..." for cell in row]
        print(fmt.format(*clipped))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one read-only Snowflake SQL query using ~/.dbt/profiles.yml")
    parser.add_argument("--sql", help="SQL string to run")
    parser.add_argument("--file", help="Path to SQL file to run")
    parser.add_argument("--profiles-yml", default=str(Path.home() / ".dbt" / "profiles.yml"))
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--target", default=None, help=f"dbt profile target (default: profile target or {DEFAULT_TARGET})")
    parser.add_argument("--warehouse")
    parser.add_argument("--database")
    parser.add_argument("--schema")
    parser.add_argument("--role")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS)
    parser.add_argument("--format", choices=["json", "csv", "tsv", "table"], default="tsv")
    parser.add_argument("--query-tag", default="query-snowflake-hz")
    args = parser.parse_args()

    sql = validate_read_only(read_sql(args))
    cfg = load_profile(Path(args.profiles_yml), args.profile, args.target)
    conn_args = connect_args_from_profile(cfg, args)

    conn = snowflake.connector.connect(**conn_args)
    try:
        cur = conn.cursor()
        safe_tag = args.query_tag.replace("'", "''")[:256]
        cur.execute(f"ALTER SESSION SET QUERY_TAG='{safe_tag}'")
        cur.execute(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS={int(args.timeout)}")
        cur.execute(sql)
        query_id = cur.sfqid
        columns = [desc[0] for desc in (cur.description or [])]
        rows = cur.fetchmany(args.max_rows + 1) if columns else []
        truncated = len(rows) > args.max_rows
        rows = rows[: args.max_rows]
        eprint(f"query_id={query_id} rows={len(rows)} truncated={str(truncated).lower()}")
        if args.format == "json":
            print(
                json.dumps(
                    {
                        "query_id": query_id,
                        "row_count": len(rows),
                        "truncated": truncated,
                        "columns": columns,
                        "rows": rows_as_dicts(columns, rows),
                    },
                    default=str,
                    separators=(",", ":"),
                )
            )
        elif args.format == "csv":
            emit_csv(columns, rows)
        elif args.format == "tsv":
            emit_csv(columns, rows, delimiter="\t")
        else:
            emit_table(columns, rows)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except snowflake.connector.errors.Error as exc:
        eprint(f"Snowflake error: {exc}")
        raise SystemExit(1)
    except KeyboardInterrupt:
        eprint("Interrupted")
        raise SystemExit(130)
