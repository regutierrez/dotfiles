#!/usr/bin/env python3
"""Collect local Pi, Claude, and Cursor sessions into normalized JSON.

The script intentionally does not summarize. It normalizes heterogeneous session
stores so an agent can compact/summarize the result consistently.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any, Iterable

LOCAL_TZ = dt.datetime.now().astimezone().tzinfo


# ---------------------------------------------------------------------------
# Time helpers


def parse_day(value: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"Invalid --date {value!r}; expected YYYY-MM-DD") from exc


def parse_time(value: Any) -> dt.datetime | None:
    """Parse common timestamp shapes into an aware datetime."""
    if value is None:
        return None

    if isinstance(value, (int, float)):
        seconds = float(value) / 1000.0 if abs(float(value)) > 10_000_000_000 else float(value)
        try:
            return dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc).astimezone(LOCAL_TZ)
        except (OverflowError, OSError, ValueError):
            return None

    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip()
    if text.isdigit():
        return parse_time(int(text))

    # ISO 8601, including the common trailing-Z form.
    try:
        iso = text.replace("Z", "+00:00") if text.endswith("Z") else text
        parsed = dt.datetime.fromisoformat(iso)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=LOCAL_TZ)
        return parsed.astimezone(LOCAL_TZ)
    except ValueError:
        pass

    return None


def file_time(path: Path) -> dt.datetime | None:
    try:
        return dt.datetime.fromtimestamp(path.stat().st_mtime, tz=LOCAL_TZ)
    except OSError:
        return None


def any_file_touched_on(day: dt.date, *paths: Path) -> bool:
    for path in paths:
        ts = file_time(path)
        if ts is not None and ts.astimezone(LOCAL_TZ).date() == day:
            return True
    return False


def local_iso(value: dt.datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(LOCAL_TZ).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Text extraction / cleaning


SKIP_CONTENT_TYPES = {
    "image",
    "image_url",
    "tool-call",
    "tool_call",
    "tool-use",
    "tool_use",
    "redacted-reasoning",
    "reasoning",
    "thinking",
    "server_tool_use",
}

CURSOR_CONTEXT_TAGS = (
    "user_info",
    "git_status",
    "agent_transcripts",
    "rules",
    "additional_data",
    "workspace_context",
    "environment_details",
    "attached_files",
    "recently_viewed_files",
)


def content_to_text(content: Any) -> str:
    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, (int, float, bool)):
        return str(content)

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = content_to_text(item)
            if text:
                parts.append(text)
        return "\n".join(parts)

    if isinstance(content, dict):
        content_type = str(content.get("type") or "").lower()
        if content_type in SKIP_CONTENT_TYPES:
            return ""

        # Prefer explicit textual fields.
        for key in ("text", "input", "output"):
            value = content.get(key)
            if isinstance(value, str):
                return value

        # Recurse into nested content, but avoid tool results unless they are
        # already represented as assistant text elsewhere.
        if "content" in content:
            return content_to_text(content.get("content"))

        return ""

    return ""


def normalize_ws(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text.strip()


def extract_tag(text: str, tag: str) -> list[str]:
    return [m.strip() for m in re.findall(rf"<{tag}[^>]*>(.*?)</{tag}>", text, flags=re.S | re.I) if m.strip()]


def clean_user_text(text: str, agent: str) -> str:
    text = normalize_ws(text)

    # Cursor wraps the actual prompt in <user_query> while a bootstrap user blob
    # contains huge environment/rules context. Prefer the real query when present.
    queries = extract_tag(text, "user_query")
    if queries:
        return normalize_ws("\n\n".join(queries))

    if agent == "cursor":
        for tag in CURSOR_CONTEXT_TAGS:
            text = re.sub(rf"<{tag}[^>]*>.*?</{tag}>", "", text, flags=re.S | re.I)
        text = re.sub(r"</?user_query[^>]*>", "", text, flags=re.I)

    return normalize_ws(text)


def clean_assistant_text(text: str) -> str:
    return normalize_ws(text)


def is_substantive_user_text(text: str) -> bool:
    text = normalize_ws(text)
    if not text:
        return False
    if not re.search(r"[A-Za-z0-9]", text):
        return False
    if text.lower() in {"/exit", "/quit", "exit", "quit", "/clear", "clear", "/help"}:
        return False
    return True


def extract_workspace_path(text: str) -> str | None:
    for pattern in (
        r"Workspace Path:\s*([^\n]+)",
        r"Git repo:\s*([^\n]+)",
        r"cwd[\"']?\s*[:=]\s*[\"']([^\"']+)[\"']",
    ):
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if value:
                return value
    return None


# ---------------------------------------------------------------------------
# Session object helpers


def new_session(agent: str, source: str, sid: str, source_path: Path) -> dict[str, Any]:
    return {
        "id": sid,
        "agent": agent,
        "source": source,
        "directory": None,
        "title": None,
        "source_paths": [str(source_path)],
        "_messages": [],
        "_activity_times": [],
        "_created_candidates": [],
    }


def add_time(session: dict[str, Any], value: Any, *, created: bool = False) -> None:
    parsed = parse_time(value)
    if parsed is None:
        return
    session["_activity_times"].append(parsed)
    if created:
        session["_created_candidates"].append(parsed)


def add_file_times(session: dict[str, Any], *paths: Path) -> None:
    for path in paths:
        ts = file_time(path)
        if ts is not None:
            session["_activity_times"].append(ts)


def add_message(session: dict[str, Any], role: str, text: str, agent: str) -> None:
    if role == "user":
        text = clean_user_text(text, agent)
        if not is_substantive_user_text(text):
            return
    elif role == "assistant":
        text = clean_assistant_text(text)
        if not text:
            return
    else:
        return

    if session.get("directory") is None and agent == "cursor":
        directory = extract_workspace_path(text)
        if directory:
            session["directory"] = directory

    session["_messages"].append({"role": role, "text": text})


def activity_dates(session: dict[str, Any]) -> set[dt.date]:
    return {ts.astimezone(LOCAL_TZ).date() for ts in session.get("_activity_times", [])}


def finish_session(session: dict[str, Any], target_day: dt.date, min_user_turns: int) -> dict[str, Any] | None:
    messages = session.get("_messages", [])
    user_turns = sum(1 for msg in messages if msg.get("role") == "user")
    assistant_turns = sum(1 for msg in messages if msg.get("role") == "assistant")

    if user_turns < min_user_turns:
        return None
    if target_day not in activity_dates(session):
        return None

    times = session.get("_activity_times", [])
    created_candidates = session.get("_created_candidates", []) or times
    session["created_at"] = min(created_candidates) if created_candidates else None
    session["last_activity_at"] = max(times) if times else None
    session["user_turns"] = user_turns
    session["assistant_turns"] = assistant_turns
    session["message_count"] = len(messages)
    return session


# ---------------------------------------------------------------------------
# Pi


def collect_pi(root: Path, target_day: dt.date, min_user_turns: int, deep_scan: bool) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    if not root.exists():
        return sessions

    for path in sorted(root.glob("*/*.jsonl")):
        if not deep_scan and not any_file_touched_on(target_day, path):
            continue
        sid = path.stem.split("_")[-1]
        session = new_session("pi", "pi-jsonl", sid, path)
        add_file_times(session, path)

        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue

        for line in lines:
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            add_time(session, rec.get("timestamp"), created=rec.get("type") == "session")

            if rec.get("type") == "session":
                session["id"] = rec.get("id") or session["id"]
                session["directory"] = rec.get("cwd") or session.get("directory")
                continue

            if rec.get("type") != "message":
                continue

            msg = rec.get("message") or {}
            role = msg.get("role")
            if role not in {"user", "assistant"}:
                continue
            if msg.get("timestamp"):
                add_time(session, msg.get("timestamp"))
            text = content_to_text(msg.get("content"))
            add_message(session, role, text, "pi")

        finished = finish_session(session, target_day, min_user_turns)
        if finished:
            sessions.append(finished)

    return sessions


# ---------------------------------------------------------------------------
# Claude


def load_claude_session_meta(root: Path) -> dict[str, dict[str, Any]]:
    meta: dict[str, dict[str, Any]] = {}
    if not root.exists():
        return meta

    for path in root.glob("*.json"):
        try:
            obj = json.loads(path.read_text(errors="replace"))
        except (OSError, json.JSONDecodeError):
            continue
        sid = obj.get("sessionId")
        if sid:
            obj["_path"] = str(path)
            meta[sid] = obj
    return meta


def collect_claude(projects_root: Path, sessions_root: Path, target_day: dt.date, min_user_turns: int, deep_scan: bool) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    if not projects_root.exists():
        return sessions

    session_meta = load_claude_session_meta(sessions_root)

    for path in sorted(projects_root.glob("*/*.jsonl")):
        if not deep_scan and not any_file_touched_on(target_day, path):
            continue
        sid = path.stem
        session = new_session("claude", "claude-project-jsonl", sid, path)
        add_file_times(session, path)

        try:
            lines = path.read_text(errors="replace").splitlines()
        except OSError:
            continue

        for line in lines:
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            if rec.get("sessionId"):
                session["id"] = rec.get("sessionId")
                sid = session["id"]

            add_time(session, rec.get("timestamp"))

            if rec.get("cwd") and not session.get("directory"):
                session["directory"] = rec.get("cwd")

            rec_type = rec.get("type")
            if rec_type == "ai-title":
                session["title"] = rec.get("aiTitle") or session.get("title")
                continue

            if rec.get("isSidechain") is True:
                continue

            if rec_type not in {"user", "assistant"}:
                continue

            msg = rec.get("message") or {}
            role = msg.get("role") or rec_type
            if role not in {"user", "assistant"}:
                continue
            text = content_to_text(msg.get("content"))
            add_message(session, role, text, "claude")

        meta = session_meta.get(session["id"])
        if meta:
            if meta.get("_path") not in session["source_paths"]:
                session["source_paths"].append(meta["_path"])
            session["directory"] = session.get("directory") or meta.get("cwd")
            add_time(session, meta.get("startedAt"), created=True)
            add_time(session, meta.get("updatedAt"))

        finished = finish_session(session, target_day, min_user_turns)
        if finished:
            sessions.append(finished)

    return sessions


# ---------------------------------------------------------------------------
# Cursor


def decode_cursor_meta_value(value: str) -> dict[str, Any]:
    if not value:
        return {}
    try:
        if re.fullmatch(r"[0-9a-fA-F]+", value) and len(value) % 2 == 0:
            value = bytes.fromhex(value).decode("utf-8", "replace")
        obj = json.loads(value)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def read_cursor_db_meta(con: sqlite3.Connection) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    try:
        for _key, value in con.execute("select key, value from meta"):
            decoded = decode_cursor_meta_value(value)
            meta.update(decoded)
    except sqlite3.Error:
        pass
    return meta


def load_json_file(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    try:
        obj = json.loads(path.read_text(errors="replace"))
        return obj if isinstance(obj, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def collect_cursor_db(db_path: Path, source: str, target_day: dt.date, min_user_turns: int, deep_scan: bool, meta_json_path: Path | None = None) -> dict[str, Any] | None:
    if not deep_scan and not any_file_touched_on(target_day, db_path, db_path.with_name("store.db-wal"), db_path.with_name("store.db-shm"), *( [meta_json_path] if meta_json_path else [] )):
        return None

    meta_json = load_json_file(meta_json_path)

    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return None

    try:
        db_meta = read_cursor_db_meta(con)
        sid = db_meta.get("agentId") or db_path.parent.name
        session = new_session("cursor", source, str(sid), db_path)

        if meta_json_path and meta_json_path.exists():
            session["source_paths"].append(str(meta_json_path))

        session["title"] = db_meta.get("name") or meta_json.get("title")
        session["directory"] = meta_json.get("cwd") or None
        # Cursor stores NO per-message timestamps and no "last updated" field — the
        # store.db `meta` table only has `createdAt`. Do NOT fall back to store.db /
        # -wal / -shm (or meta.json) file mtimes for activity: SQLite WAL/checkpoint/
        # indexing bumps those long after a chat ends, so using them made every
        # historical cursor session look "active today" and massively over-included
        # them (120 collected / 104 cursor on 2026-06-22; only ~2 were really today).
        # `createdAt` is the only honest activity signal cursor exposes; a session
        # without it is left undated and dropped by finish_session's date filter.
        add_time(session, db_meta.get("createdAt"), created=True)

        try:
            rows = con.execute("select rowid, id, data from blobs order by rowid")
        except sqlite3.Error:
            return None

        for _rowid, _blob_id, data in rows:
            if not isinstance(data, bytes):
                continue
            stripped = data.lstrip()
            if not stripped.startswith((b"{", b"[")):
                continue
            try:
                obj = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(obj, dict):
                continue
            role = obj.get("role")
            if role not in {"user", "assistant"}:
                continue
            text = content_to_text(obj.get("content"))
            if session.get("directory") is None:
                directory = extract_workspace_path(text)
                if directory:
                    session["directory"] = directory
            add_message(session, role, text, "cursor")

        return finish_session(session, target_day, min_user_turns)
    finally:
        con.close()


def collect_cursor(chats_root: Path, acp_root: Path, target_day: dt.date, min_user_turns: int, deep_scan: bool) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []

    if chats_root.exists():
        for db_path in sorted(chats_root.glob("*/*/store.db")):
            session = collect_cursor_db(db_path, "cursor-chat-sqlite", target_day, min_user_turns, deep_scan)
            if session:
                sessions.append(session)

    if acp_root.exists():
        for session_dir in sorted(acp_root.glob("*")):
            if not session_dir.is_dir():
                continue
            db_path = session_dir / "store.db"
            if not db_path.exists():
                continue
            session = collect_cursor_db(db_path, "cursor-acp-sqlite", target_day, min_user_turns, deep_scan, session_dir / "meta.json")
            if session:
                sessions.append(session)

    return sessions


# ---------------------------------------------------------------------------
# Output shaping


def clip_text(text: str, max_chars: int) -> tuple[str, bool]:
    if len(text) <= max_chars:
        return text, False
    if max_chars <= 20:
        return text[:max_chars], True
    head = max_chars // 2
    tail = max_chars - head - 18
    return text[:head].rstrip() + "\n...[truncated]...\n" + text[-tail:].lstrip(), True


def transcript_for_output(messages: list[dict[str, str]], max_chars: int) -> tuple[list[dict[str, str]], bool]:
    if max_chars <= 0:
        return [], bool(messages)

    prepared: list[dict[str, str]] = []
    text_was_clipped = False
    for msg in messages:
        cap = 6_000 if msg.get("role") == "assistant" else 4_000
        clipped, was_clipped = clip_text(msg.get("text", ""), cap)
        text_was_clipped = text_was_clipped or was_clipped
        prepared.append({"role": msg.get("role", ""), "text": clipped})

    total = sum(len(msg["text"]) + len(msg["role"]) + 8 for msg in prepared)
    if total <= max_chars:
        return prepared, text_was_clipped

    selected: set[int] = set()
    selected.update(range(min(4, len(prepared))))
    selected.update(range(max(0, len(prepared) - 10), len(prepared)))
    selected.update(i for i, msg in enumerate(prepared) if msg.get("role") == "user")

    ordered = sorted(selected)
    if not ordered:
        return [], True

    per_message_cap = max(600, (max_chars // max(1, len(ordered))) - 32)
    output: list[dict[str, str]] = []
    used = 0
    previous_index: int | None = None

    for idx in ordered:
        if previous_index is not None and idx > previous_index + 1:
            marker = {"role": "omitted", "text": f"... omitted {idx - previous_index - 1} middle turns ..."}
            marker_cost = len(marker["text"]) + 20
            if used + marker_cost <= max_chars:
                output.append(marker)
                used += marker_cost

        msg = prepared[idx]
        clipped, _ = clip_text(msg["text"], per_message_cap)
        cost = len(clipped) + len(msg["role"]) + 8
        if used + cost > max_chars and output:
            break
        output.append({"role": msg["role"], "text": clipped})
        used += cost
        previous_index = idx

    return output, True


def transcript_hash(session: dict[str, Any]) -> str:
    h = hashlib.sha256()
    for msg in session.get("_messages", []):
        h.update(msg.get("role", "").encode())
        h.update(b"\0")
        h.update(msg.get("text", "").encode(errors="replace"))
        h.update(b"\0")
    return h.hexdigest()


def dedupe_cursor_sessions(sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: dict[tuple[str, str], dict[str, Any]] = {}

    for session in sessions:
        if session.get("agent") != "cursor" or not session.get("_messages"):
            result.append(session)
            continue

        key = ("cursor", transcript_hash(session))
        existing = seen.get(key)
        if existing is None:
            seen[key] = session
            result.append(session)
            continue

        existing_sources = set(existing.get("source", "").split("+"))
        existing_sources.add(session.get("source", ""))
        existing["source"] = "+".join(sorted(src for src in existing_sources if src))

        for path in session.get("source_paths", []):
            if path not in existing["source_paths"]:
                existing["source_paths"].append(path)

        existing["directory"] = existing.get("directory") or session.get("directory")
        existing["title"] = existing.get("title") or session.get("title")
        existing["_activity_times"].extend(session.get("_activity_times", []))
        existing["_created_candidates"].extend(session.get("_created_candidates", []))
        existing["last_activity_at"] = max(existing["_activity_times"]) if existing.get("_activity_times") else existing.get("last_activity_at")

    return result


def public_session(session: dict[str, Any], max_session_chars: int, no_transcript: bool) -> dict[str, Any]:
    transcript, truncated = ([], bool(session.get("_messages"))) if no_transcript else transcript_for_output(session.get("_messages", []), max_session_chars)

    return {
        "id": session.get("id"),
        "agent": session.get("agent"),
        "source": session.get("source"),
        "directory": session.get("directory"),
        "title": session.get("title"),
        "created_at": local_iso(session.get("created_at")),
        "last_activity_at": local_iso(session.get("last_activity_at")),
        "user_turns": session.get("user_turns", 0),
        "assistant_turns": session.get("assistant_turns", 0),
        "message_count": session.get("message_count", 0),
        "source_paths": session.get("source_paths", []),
        "truncated": truncated,
        "transcript": transcript,
    }


# ---------------------------------------------------------------------------
# CLI


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect local agent sessions active on a date into normalized JSON.")
    parser.add_argument("--date", default=dt.datetime.now(tz=LOCAL_TZ).date().isoformat(), help="Local date to collect, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--min-user-turns", type=int, default=2, help="Minimum substantive user prompts per session. Default: 2.")
    parser.add_argument("--max-session-chars", type=int, default=30_000, help="Max transcript characters per session. Use 0 for metadata only. Default: 30000.")
    parser.add_argument("--no-transcript", action="store_true", help="Emit metadata without transcript text.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    parser.add_argument("--deep-scan", action="store_true", help="Scan all stored sessions instead of prefiltering by file mtime. Slower, useful for historical dates.")
    parser.add_argument("--pi-root", default="~/.pi/agent/sessions", help="Pi sessions root.")
    parser.add_argument("--claude-projects-root", default="~/.claude/projects", help="Claude project sessions root.")
    parser.add_argument("--claude-sessions-root", default="~/.claude/sessions", help="Claude session metadata root.")
    parser.add_argument("--cursor-chats-root", default="~/.cursor/chats", help="Cursor chat DB root.")
    parser.add_argument("--cursor-acp-root", default="~/.cursor/acp-sessions", help="Cursor ACP session root.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    target_day = parse_day(args.date)

    roots = {
        "pi": str(Path(args.pi_root).expanduser()),
        "claude_projects": str(Path(args.claude_projects_root).expanduser()),
        "claude_sessions": str(Path(args.claude_sessions_root).expanduser()),
        "cursor_chats": str(Path(args.cursor_chats_root).expanduser()),
        "cursor_acp": str(Path(args.cursor_acp_root).expanduser()),
    }

    sessions: list[dict[str, Any]] = []
    sessions.extend(collect_pi(Path(args.pi_root).expanduser(), target_day, args.min_user_turns, args.deep_scan))
    sessions.extend(collect_claude(Path(args.claude_projects_root).expanduser(), Path(args.claude_sessions_root).expanduser(), target_day, args.min_user_turns, args.deep_scan))
    sessions.extend(collect_cursor(Path(args.cursor_chats_root).expanduser(), Path(args.cursor_acp_root).expanduser(), target_day, args.min_user_turns, args.deep_scan))
    sessions = dedupe_cursor_sessions(sessions)

    sessions.sort(key=lambda item: (item.get("last_activity_at") or dt.datetime.min.replace(tzinfo=LOCAL_TZ), item.get("agent", ""), item.get("id", "")))

    public_sessions = [public_session(session, args.max_session_chars, args.no_transcript) for session in sessions]

    output = {
        "date": target_day.isoformat(),
        "generated_at": dt.datetime.now(tz=LOCAL_TZ).isoformat(timespec="seconds"),
        "timezone": str(LOCAL_TZ),
        "min_user_turns": args.min_user_turns,
        "roots": roots,
        "session_count": len(public_sessions),
        "sessions": public_sessions,
    }

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
