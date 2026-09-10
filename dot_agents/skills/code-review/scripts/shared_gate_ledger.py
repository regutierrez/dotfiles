#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


SCHEMA_VERSION: int = 1
REQUIRED_ROW_FIELDS = (
    "producer_evidence",
    "producer_requirement",
    "phase",
    "gate_result",
    "downstream_consumer",
    "retry_satisfiability",
)
PRODUCER_REQUIREMENTS = {"required", "allowed", "forbidden", "conditional"}
REQUIRED_CALLER_FIELDS = (
    "caller",
    "producer",
    "phase",
    "copy_checked",
    "validation_handling",
    "later_handling",
    "expected_outcome",
)
REQUIRED_ERASURE_FIELDS = (
    "transformer",
    "declared_input",
    "undeclared_input",
    "validation_copy",
    "retained_copy",
    "result",
)


def _run(command: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True)


def _repo_root(path: Path) -> Path:
    result = _run(["git", "rev-parse", "--show-toplevel"], cwd=path)
    return Path(result.stdout.strip())


def _decode_key(text: str) -> str | None:
    try:
        expression = ast.parse(text, mode="eval").body
    except (SyntaxError, ValueError):
        return None
    if isinstance(expression, ast.Constant) and isinstance(expression.value, str):
        return expression.value
    if not isinstance(expression, ast.JoinedStr):
        return None

    parts: list[str] = []
    for value in expression.values:
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            parts.append(value.value)
        elif isinstance(value, ast.FormattedValue):
            parts.append(f"{{{ast.unparse(value.value)}}}")
        else:
            return None
    return "".join(parts)


def _key_search_token(key: str) -> str:
    literals = _key_search_literals(key)
    token = max(literals, key=len, default="")
    if not token:
        raise ValueError(f"generated key family {key!r} has no searchable literal")
    return token


def _source_contains_key(key: str, source: str) -> bool:
    if "{" not in key:
        return key in source
    position = 0
    for literal in _key_search_literals(key):
        position = source.find(literal, position)
        if position == -1:
            return False
        position += len(literal)
    return True


def _is_prompt_or_template_path(path: str) -> bool:
    return any("prompt" in part or "template" in part for part in Path(path).parts)


def _key_search_literals(key: str) -> list[str]:
    literals: list[str] = []
    cursor = 0
    while cursor < len(key):
        opening = key.find("{", cursor)
        if opening == -1:
            literals.append(key[cursor:])
            break
        literals.append(key[cursor:opening])
        closing = key.find("}", opening + 1)
        if closing == -1:
            return [key]
        cursor = closing + 1
    return [literal for literal in literals if literal]


def _ast_grep_matches(repo: Path, paths: list[str], config: Path, runner: Path) -> list[dict[str, Any]]:
    result = _run(
        [
            "bash",
            str(runner),
            "scan",
            "--config",
            str(config),
            "--json=compact",
            *paths,
        ],
        cwd=repo,
    )
    matches = json.loads(result.stdout)
    if not isinstance(matches, list):
        raise ValueError("ast-grep output must be a JSON array")
    return matches


def _materialize_ref(repo: Path, ref: str, paths: list[str], destination: Path) -> None:
    archive = subprocess.Popen(
        ["git", "archive", "--format=tar", ref, "--", *paths],
        cwd=repo,
        stdout=subprocess.PIPE,
    )
    if archive.stdout is None:
        raise RuntimeError("git archive did not provide stdout")
    extract = subprocess.run(["tar", "-x", "-C", str(destination)], stdin=archive.stdout, capture_output=True)
    archive.stdout.close()
    archive_returncode = archive.wait()
    if archive_returncode:
        raise subprocess.CalledProcessError(archive_returncode, archive.args)
    if extract.returncode:
        raise subprocess.CalledProcessError(extract.returncode, extract.args, stderr=extract.stderr)


def _search_matches(repo: Path, ref: str, roots: list[str], key: str) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    search_token = _key_search_token(key)
    command = ["git", "grep", "-F", "-l", "-z", "--full-name", "-e", search_token, ref, "--", *roots]
    result = subprocess.run(command, cwd=repo, capture_output=True)
    if result.returncode not in (0, 1):
        raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
    for location in result.stdout.split(b"\0"):
        if not location:
            continue
        decoded_location = location.decode()
        _, path = decoded_location.split(":", 1)
        source_result = _run(["git", "show", f"{ref}:{path}"], cwd=repo)
        for line_number, source in enumerate(source_result.stdout.splitlines(), start=1):
            if search_token not in source:
                continue
            decoded_source = source.strip()
            symbolic_spellings = [
                spelling
                for spelling in (f":{search_token}", f"@{search_token}", f"${search_token}")
                if spelling in decoded_source
            ]
            matches.append(
                {
                    "id": f"{key}:{len(matches)}",
                    "spellings": [search_token, *symbolic_spellings],
                    "path": path,
                    "line": line_number,
                    "source": decoded_source,
                    "symbolic": bool(symbolic_spellings),
                    "producer_candidate": bool(symbolic_spellings) and _is_prompt_or_template_path(path),
                }
            )
    return matches


def inventory(args: argparse.Namespace) -> int:
    repo = _repo_root(Path(args.repo).resolve())
    skill_root = Path(__file__).resolve().parent.parent
    config = skill_root / "ast-grep" / "sgconfig.yml"
    runner = skill_root / "scripts" / "ast-grep.sh"
    with tempfile.TemporaryDirectory(prefix="shared-gate-ledger-") as temporary_directory:
        extracted_ref = Path(temporary_directory)
        _materialize_ref(repo, args.ref, args.consumer_path, extracted_ref)
        raw_matches = _ast_grep_matches(extracted_ref, args.consumer_path, config, runner)

    consumers: dict[str, list[dict[str, Any]]] = {}
    for match in raw_matches:
        key_data = match.get("metaVariables", {}).get("single", {}).get("KEY")
        if not isinstance(key_data, dict) or not isinstance(key_data.get("text"), str):
            continue
        key = _decode_key(key_data["text"])
        if key is None:
            continue
        consumers.setdefault(key, []).append(
            {
                "rule_id": match.get("ruleId"),
                "path": match.get("file"),
                "range": match.get("range"),
                "source": match.get("text"),
            }
        )
    for key in args.key:
        if not key:
            raise ValueError("--key values must not be empty")
        consumers.setdefault(key, []).append(
            {
                "rule_id": "manual",
                "path": None,
                "range": None,
                "source": "supplied with --key",
            }
        )

    searches = {key: _search_matches(repo, args.ref, args.search_root, key) for key in sorted(consumers)}
    rows = {
        key: {
            "producer_evidence": "",
            "producer_requirement": "",
            "producer_match_ids": [],
            "phase": "",
            "post_gate_match_ids": [],
            "gate_result": "",
            "downstream_consumer": "",
            "retry_satisfiability": "",
            "match_dispositions": {},
        }
        for key in sorted(consumers)
    }
    output = {
        "schema_version": SCHEMA_VERSION,
        "ref": args.ref,
        "consumer_paths": args.consumer_path,
        "search_roots": args.search_root,
        "consumer_keys": consumers,
        "searches": searches,
        "rows": rows,
        "caller_contracts": [],
        "transform_erasure": [],
        "transform_erasure_not_applicable": "",
    }
    json.dump(output, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _match_index(document: dict[str, Any]) -> dict[str, tuple[str, dict[str, Any]]]:
    return {
        match["id"]: (key, match)
        for key, matches in document.get("searches", {}).items()
        for match in matches
        if isinstance(match, dict) and isinstance(match.get("id"), str)
    }


def validate(args: argparse.Namespace) -> int:
    document = json.load(args.worksheet)
    errors: list[str] = []
    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version must be {SCHEMA_VERSION}")

    consumer_keys = set(document.get("consumer_keys", {}))
    searched_keys = set(document.get("searches", {}))
    row_keys = set(document.get("rows", {}))
    if not consumer_keys:
        errors.append("consumer_keys must contain at least one extracted or manually supplied key")
    if missing := consumer_keys - searched_keys:
        errors.append(f"consumer keys missing searches: {sorted(missing)}")
    if missing := consumer_keys - row_keys:
        errors.append(f"consumer keys missing rows: {sorted(missing)}")
    if extra := row_keys - consumer_keys:
        errors.append(f"rows without consumer keys: {sorted(extra)}")

    match_index = _match_index(document)
    for key in sorted(consumer_keys):
        row = document.get("rows", {}).get(key, {})
        for field in REQUIRED_ROW_FIELDS:
            if not _nonempty(row.get(field)):
                errors.append(f"{key}: {field} is required")

        producer_match_ids = row.get("producer_match_ids", [])
        post_gate_match_ids = row.get("post_gate_match_ids", [])
        if not isinstance(producer_match_ids, list) or not isinstance(post_gate_match_ids, list):
            errors.append(f"{key}: match id fields must be arrays")
            producer_match_ids = []
            post_gate_match_ids = []
        referenced_ids = set(producer_match_ids) | set(post_gate_match_ids)
        for match_id in referenced_ids:
            indexed = match_index.get(match_id)
            if indexed is None:
                errors.append(f"{key}: unknown match id {match_id}")
                continue
            match_key, match = indexed
            if match_key != key or not _source_contains_key(key, match.get("source", "")):
                errors.append(f"{key}: match {match_id} does not contain the exact key")

        required_producer_ids = {
            match["id"] for match in document.get("searches", {}).get(key, []) if match.get("producer_candidate")
        }
        if missing_producer_ids := required_producer_ids - set(producer_match_ids):
            errors.append(
                f"{key}: prompt/template producer candidates missing from producer_match_ids: {sorted(missing_producer_ids)}"
            )

        producer_requirement = row.get("producer_requirement")
        if producer_requirement not in PRODUCER_REQUIREMENTS:
            errors.append(f"{key}: producer_requirement must be one of {sorted(PRODUCER_REQUIREMENTS)}")

        phase = row.get("phase")
        if phase not in {"pre-gate", "post-gate", "unresolved"}:
            errors.append(f"{key}: phase must be pre-gate, post-gate, or unresolved")
        elif phase == "unresolved":
            errors.append(f"{key}: phase is unresolved; do not issue a verdict")
        if phase == "pre-gate" and not row.get("producer_match_ids"):
            errors.append(f"{key}: pre-gate phase requires producer_match_ids")
        if phase == "post-gate" and not row.get("post_gate_match_ids"):
            errors.append(f"{key}: post-gate phase requires post_gate_match_ids")

        dispositions = row.get("match_dispositions", {})
        if not isinstance(dispositions, dict):
            errors.append(f"{key}: match_dispositions must be an object")
            dispositions = {}
        known_key_match_ids = {match["id"] for match in document.get("searches", {}).get(key, [])}
        if unknown_dispositions := set(dispositions) - known_key_match_ids:
            errors.append(f"{key}: dispositions reference unknown matches: {sorted(unknown_dispositions)}")
        for match in document.get("searches", {}).get(key, []):
            if match.get("symbolic") and not _nonempty(dispositions.get(match["id"])):
                errors.append(f"{key}: symbolic match {match['id']} needs a disposition")

    caller_contracts = document.get("caller_contracts", [])
    if not caller_contracts:
        errors.append("caller_contracts must contain at least one row")
    for index, contract in enumerate(caller_contracts):
        for field in REQUIRED_CALLER_FIELDS:
            if not _nonempty(contract.get(field)):
                errors.append(f"caller_contracts[{index}]: {field} is required")

    erasure_rows = document.get("transform_erasure", [])
    if not erasure_rows and not _nonempty(document.get("transform_erasure_not_applicable")):
        errors.append("transform_erasure needs rows or a transform_erasure_not_applicable explanation")
    for index, row in enumerate(erasure_rows):
        for field in REQUIRED_ERASURE_FIELDS:
            if not _nonempty(row.get(field)):
                errors.append(f"transform_erasure[{index}]: {field} is required")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        f"validated {len(consumer_keys)} consumer keys; consumer keys - searched keys = empty",
        file=sys.stderr,
    )
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Build and validate shared-gate review evidence")
    subparsers = result.add_subparsers(dest="command", required=True)

    inventory_parser = subparsers.add_parser("inventory", help="extract consumer keys and search a Git ref")
    inventory_parser.add_argument("--repo", default=".")
    inventory_parser.add_argument("--ref", required=True)
    inventory_parser.add_argument("--consumer-path", action="append", required=True)
    inventory_parser.add_argument("--search-root", action="append", required=True)
    inventory_parser.add_argument("--key", action="append", default=[], help="add a dynamic key ast-grep cannot extract")
    inventory_parser.set_defaults(handler=inventory)

    validate_parser = subparsers.add_parser("validate", help="validate a completed JSON worksheet")
    validate_parser.add_argument("worksheet", nargs="?", type=argparse.FileType("r"), default=sys.stdin)
    validate_parser.set_defaults(handler=validate)
    return result


def main() -> int:
    args = parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
