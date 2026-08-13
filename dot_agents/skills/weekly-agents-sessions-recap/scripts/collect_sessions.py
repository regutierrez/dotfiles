#!/usr/bin/env python3
"""Collect local Pi and Claude sessions into normalized JSON.

The script intentionally does not summarize. It normalizes heterogeneous session
stores over a date range so an agent can compact/summarize the result consistently.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any

LOCAL_TZ = dt.datetime.now().astimezone().tzinfo


# ---------------------------------------------------------------------------
# Time helpers


def parse_day(value: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Invalid date {value!r}; expected YYYY-MM-DD") from exc


def parse_week(value: str) -> tuple[dt.date, dt.date]:
    match = re.fullmatch(r"(\d{4})-W(\d{2})", value, flags=re.I)
    if not match:
        raise ValueError(f"Invalid --week {value!r}; expected YYYY-Www")
    try:
        start = dt.date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    except ValueError as exc:
        raise ValueError(f"Invalid ISO week {value!r}") from exc
    return start, start + dt.timedelta(days=6)


def default_period(today: dt.date) -> tuple[dt.date, dt.date]:
    """Return this Monday-Sunday week on Sunday, otherwise the prior full week."""
    this_monday = today - dt.timedelta(days=today.weekday())
    if today.weekday() == 6:
        return this_monday, today
    end = this_monday - dt.timedelta(days=1)
    return end - dt.timedelta(days=6), end


def iso_week_label(start: dt.date, end: dt.date) -> str | None:
    if start.weekday() != 0 or end != start + dt.timedelta(days=6):
        return None
    iso = start.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


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


def any_file_touched_on_or_after(day: dt.date, *paths: Path) -> bool:
    for path in paths:
        ts = file_time(path)
        if ts is not None and ts.astimezone(LOCAL_TZ).date() >= day:
            return True
    return False


def is_in_period(value: dt.datetime, start: dt.date, end: dt.date) -> bool:
    local_day = value.astimezone(LOCAL_TZ).date()
    return start <= local_day <= end


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

INJECTED_USER_TAGS = (
    "agent_skills",
    "skill",
    "local-command-caveat",
    "command-name",
)

NON_SUBSTANTIVE_USER_TEXTS = {
    "continue",
    "hello",
    "hi",
    "no",
    "ok",
    "okay",
    "pong",
    "thanks",
    "thank you",
    "yes",
}

TEST_PROMPT_PATTERNS = (
    r"(?:reply|respond|say|echo) with exactly[: ]+.+",
    r"echo hello-from-test",
    r"say hello(?:[-\w]*)?",
    r"count from \d+ to \d+",
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


def clean_user_text(text: str) -> str:
    text = normalize_ws(text)

    for tag in INJECTED_USER_TAGS:
        text = re.sub(rf"<{tag}[^>]*>.*?</{tag}>", "", text, flags=re.S | re.I)

    return normalize_ws(text)


def clean_assistant_text(text: str) -> str:
    return normalize_ws(text)


def is_substantive_user_text(text: str) -> bool:
    text = normalize_ws(text)
    if not text:
        return False
    if not re.search(r"[A-Za-z0-9]", text):
        return False
    normalized = text.lower().strip()
    if normalized in NON_SUBSTANTIVE_USER_TEXTS:
        return False
    if normalized in {"/exit", "/quit", "exit", "quit", "/clear", "clear", "/help"}:
        return False
    if re.fullmatch(r"/\S+", normalized):
        return False
    if re.fullmatch(r"resume\s*=\s*[0-9a-f-]+", normalized):
        return False
    if any(re.fullmatch(pattern, normalized) for pattern in TEST_PROMPT_PATTERNS):
        return False
    return True


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


def add_message(session: dict[str, Any], role: str, text: str, timestamp: Any = None) -> None:
    if role == "user":
        text = clean_user_text(text)
        if not is_substantive_user_text(text):
            return
    elif role == "assistant":
        text = clean_assistant_text(text)
        if not text:
            return
    else:
        return

    session["_messages"].append({"role": role, "text": text, "_at": parse_time(timestamp)})


def finish_session(
    session: dict[str, Any],
    start_day: dt.date,
    end_day: dt.date,
    min_user_turns: int,
) -> dict[str, Any] | None:
    times = session.get("_activity_times", [])
    period_times = [value for value in times if is_in_period(value, start_day, end_day)]
    if not period_times:
        return None

    messages = session.get("_messages", [])
    if any(message.get("_at") is not None for message in messages):
        messages = [
            message
            for message in messages
            if message.get("_at") is None or is_in_period(message["_at"], start_day, end_day)
        ]
        session["_messages"] = messages

    user_turns = sum(1 for msg in messages if msg.get("role") == "user")
    assistant_turns = sum(1 for msg in messages if msg.get("role") == "assistant")

    if user_turns < min_user_turns:
        return None

    created_candidates = session.get("_created_candidates", []) or times
    session["created_at"] = min(created_candidates) if created_candidates else None
    session["first_activity_at"] = min(period_times)
    session["last_activity_at"] = max(period_times)
    session["active_dates"] = sorted({value.astimezone(LOCAL_TZ).date().isoformat() for value in period_times})
    session["user_turns"] = user_turns
    session["assistant_turns"] = assistant_turns
    session["message_count"] = len(messages)
    return session


# ---------------------------------------------------------------------------
# Pi


def collect_pi(
    root: Path,
    start_day: dt.date,
    end_day: dt.date,
    min_user_turns: int,
    deep_scan: bool,
) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    if not root.exists():
        return sessions

    for path in sorted(root.glob("*/*.jsonl")):
        if not deep_scan and not any_file_touched_on_or_after(start_day, path):
            continue
        sid = path.stem.split("_")[-1]
        session = new_session("pi", "pi-jsonl", sid, path)

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
            add_message(session, role, text, msg.get("timestamp") or rec.get("timestamp"))

        finished = finish_session(session, start_day, end_day, min_user_turns)
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


def collect_claude(
    projects_root: Path,
    sessions_root: Path,
    start_day: dt.date,
    end_day: dt.date,
    min_user_turns: int,
    deep_scan: bool,
) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    if not projects_root.exists():
        return sessions

    session_meta = load_claude_session_meta(sessions_root)

    for path in sorted(projects_root.glob("*/*.jsonl")):
        if not deep_scan and not any_file_touched_on_or_after(start_day, path):
            continue
        sid = path.stem
        session = new_session("claude", "claude-project-jsonl", sid, path)

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
            add_message(session, role, text, rec.get("timestamp"))

        meta = session_meta.get(session["id"])
        if meta:
            if meta.get("_path") not in session["source_paths"]:
                session["source_paths"].append(meta["_path"])
            session["directory"] = session.get("directory") or meta.get("cwd")
            add_time(session, meta.get("startedAt"), created=True)
            add_time(session, meta.get("updatedAt"))

        finished = finish_session(session, start_day, end_day, min_user_turns)
        if finished:
            sessions.append(finished)

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


def transcript_for_output(messages: list[dict[str, Any]], max_chars: int) -> tuple[list[dict[str, str]], bool]:
    if max_chars <= 0:
        return [], bool(messages)

    prepared: list[dict[str, str]] = []
    text_was_clipped = False
    for msg in messages:
        cap = 6_000 if msg.get("role") == "assistant" else 4_000
        clipped, was_clipped = clip_text(msg.get("text", ""), cap)
        text_was_clipped = text_was_clipped or was_clipped
        prepared_message = {"role": msg.get("role", ""), "text": clipped}
        if msg.get("_at") is not None:
            prepared_message["timestamp"] = local_iso(msg["_at"]) or ""
        prepared.append(prepared_message)

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
        output_message = {"role": msg["role"], "text": clipped}
        if msg.get("timestamp"):
            output_message["timestamp"] = msg["timestamp"]
        output.append(output_message)
        used += cost
        previous_index = idx

    return output, True


def public_session(session: dict[str, Any], max_session_chars: int, no_transcript: bool) -> dict[str, Any]:
    transcript, truncated = ([], bool(session.get("_messages"))) if no_transcript else transcript_for_output(session.get("_messages", []), max_session_chars)

    return {
        "id": session.get("id"),
        "agent": session.get("agent"),
        "source": session.get("source"),
        "directory": session.get("directory"),
        "title": session.get("title"),
        "created_at": local_iso(session.get("created_at")),
        "first_activity_at": local_iso(session.get("first_activity_at")),
        "last_activity_at": local_iso(session.get("last_activity_at")),
        "active_dates": session.get("active_dates", []),
        "user_turns": session.get("user_turns", 0),
        "assistant_turns": session.get("assistant_turns", 0),
        "message_count": session.get("message_count", 0),
        "source_paths": session.get("source_paths", []),
        "truncated": truncated,
        "transcript": transcript,
    }


# ---------------------------------------------------------------------------
# CLI


def resolve_period(args: argparse.Namespace, parser: argparse.ArgumentParser) -> tuple[dt.date, dt.date]:
    selectors = sum(
        (
            bool(args.week),
            bool(args.date),
            bool(args.start_date or args.end_date),
        )
    )
    if selectors > 1:
        parser.error("Use only one of --week, --date, or --start-date/--end-date")

    try:
        if args.week:
            return parse_week(args.week)
        if args.date:
            day = parse_day(args.date)
            return day, day
        if args.start_date or args.end_date:
            if not args.start_date or not args.end_date:
                parser.error("--start-date and --end-date must be supplied together")
            start, end = parse_day(args.start_date), parse_day(args.end_date)
            if start > end:
                parser.error("--start-date must be on or before --end-date")
            return start, end
    except ValueError as exc:
        parser.error(str(exc))

    return default_period(dt.datetime.now(tz=LOCAL_TZ).date())


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Collect local agent sessions active during a date range into normalized JSON."
    )
    parser.add_argument("--week", help="ISO week to collect, YYYY-Www.")
    parser.add_argument("--start-date", help="First local date to collect, YYYY-MM-DD. Use with --end-date.")
    parser.add_argument("--end-date", help="Last local date to collect, YYYY-MM-DD. Use with --start-date.")
    parser.add_argument("--date", help="Collect one local date, YYYY-MM-DD. Retained for single-day compatibility.")
    parser.add_argument(
        "--min-user-turns",
        type=int,
        default=2,
        help="Minimum substantive user prompts per session. Default: 2.",
    )
    parser.add_argument(
        "--max-session-chars",
        type=int,
        default=30_000,
        help="Max transcript characters per session. Use 0 for metadata only. Default: 30000.",
    )
    parser.add_argument("--no-transcript", action="store_true", help="Emit metadata without transcript text.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    parser.add_argument("--deep-scan", action="store_true", help="Scan all stored sessions instead of prefiltering by file mtime. Slower, useful for historical dates.")
    parser.add_argument("--pi-root", default="~/.pi/agent/sessions", help="Pi sessions root.")
    parser.add_argument("--claude-projects-root", default="~/.claude/projects", help="Claude project sessions root.")
    parser.add_argument("--claude-sessions-root", default="~/.claude/sessions", help="Claude session metadata root.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    start_day, end_day = resolve_period(args, parser)

    roots = {
        "pi": str(Path(args.pi_root).expanduser()),
        "claude_projects": str(Path(args.claude_projects_root).expanduser()),
        "claude_sessions": str(Path(args.claude_sessions_root).expanduser()),
    }

    sessions: list[dict[str, Any]] = []
    sessions.extend(
        collect_pi(
            Path(args.pi_root).expanduser(),
            start_day,
            end_day,
            args.min_user_turns,
            args.deep_scan,
        )
    )
    sessions.extend(
        collect_claude(
            Path(args.claude_projects_root).expanduser(),
            Path(args.claude_sessions_root).expanduser(),
            start_day,
            end_day,
            args.min_user_turns,
            args.deep_scan,
        )
    )

    sessions.sort(
        key=lambda item: (
            item.get("last_activity_at") or dt.datetime.min.replace(tzinfo=LOCAL_TZ),
            item.get("agent", ""),
            item.get("id", ""),
        )
    )

    public_sessions = [public_session(session, args.max_session_chars, args.no_transcript) for session in sessions]

    output = {
        "period_start": start_day.isoformat(),
        "period_end": end_day.isoformat(),
        "iso_week": iso_week_label(start_day, end_day),
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
