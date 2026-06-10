#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["boto3"]
# ///
"""Stitch chat-explore .log artifacts from S3 into a single thread file.

Each chat-explore turn writes <org_id>/chat-explore-logs/<route>/<request_id>.log
to the bucket. There is no thread-level id propagated to logs, so callers must
either pass the per-turn request_ids directly, or supply enough context for pup
to discover them.

Usage examples:

  # explicit list
  scripts/stitch_chat_thread.py \\
      --org-id faf87671-b809-4dcb-8a59-3c5eeb0cdec0 \\
      --request-ids 71300674-...,79852d3a-...,105b3478-...,0b01d4c5-...,876d4c2e-...

  # discover via pup
  scripts/stitch_chat_thread.py \\
      --org-id faf87671-b809-4dcb-8a59-3c5eeb0cdec0 \\
      --uid HBFJpOr2x0T4G5bnTXAVuq2pQlL2 \\
      --audience-id akkio_audience_c1b18f6d_9d9d_439d_ac86_18b0f5c819c4 \\
      --from 2026-05-06T19:00:00Z --to 2026-05-06T22:30:00Z

Output directory layout:
  thread_<first-rid-short>/
    turns/<request_id>.log     # raw per-turn logs as downloaded
    thread.log                  # concatenated, ordered by first timestamp
    request_ids.txt             # discovered/explicit ids, one per line
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

DEFAULT_BUCKET = "akkio-horizon-production"
DEFAULT_ROUTE = "chat-explore-create"
DEFAULT_SERVICE = "ml-server-workers-temporal"
# Single-fire-per-turn marker; used to dedupe pup hits down to one row per turn.
DEFAULT_MARKER_LINE = "Started chat_explore"
LOGURU_TS = re.compile(r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)")


def discover_request_ids(
    uid: str, frm: str, to: str, audience_id: str | None,
    service: str, marker_line: str,
) -> list[str]:
    parts = [f"service:{service}", f"@extra.auth.uid:{uid}"]
    if audience_id:
        parts.append(f"@extra.audience_id:{audience_id}")
    parts.append(f'"{marker_line}"')
    query = " ".join(parts)

    cmd = [
        "pup", "logs", "search",
        "--query", query,
        "--from", frm, "--to", to,
        "--limit", "500",
        "--sort", "timestamp",
        "--output", "json",
    ]
    print(f"[pup] {' '.join(cmd)}", file=sys.stderr)
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    raw = json.loads(res.stdout) if res.stdout.strip() else []

    seen: set[str] = set()
    ordered: list[str] = []
    for entry in raw:
        rid = (
            entry.get("attributes", {})
            .get("extra", {})
            .get("trace_headers", {})
            .get("request_id")
        )
        if rid and rid not in seen:
            seen.add(rid)
            ordered.append(rid)
    return ordered


def s3_log_key(org_id: str, route: str, request_id: str) -> str:
    return f"{org_id}/chat-explore-logs/{route}/{request_id}.log"


def download_log(s3, bucket: str, key: str, dst: Path) -> bool:
    try:
        s3.download_file(bucket, key, str(dst))
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "?")
        print(f"[warn] s3://{bucket}/{key} unavailable ({code})", file=sys.stderr)
        return False


def first_timestamp(path: Path) -> str:
    try:
        with path.open() as f:
            for line in f:
                m = LOGURU_TS.match(line)
                if m:
                    return m.group(1)
    except OSError:
        pass
    return ""


def stitch(turn_files: list[Path], out_path: Path) -> list[tuple[str, Path]]:
    pairs = sorted(
        ((first_timestamp(p), p) for p in turn_files),
        key=lambda t: t[0] or "9999",
    )
    with out_path.open("w") as out:
        for ts, p in pairs:
            rid = p.stem
            out.write(f"\n===== TURN {rid} (first_ts={ts or 'unknown'}) =====\n\n")
            with p.open() as f:
                for line in f:
                    out.write(line)
    return pairs


def parse_request_ids(arg: str) -> list[str]:
    if arg.startswith("@"):
        text = Path(arg[1:]).read_text()
        return [s.strip() for s in text.split() if s.strip()]
    return [s.strip() for s in arg.split(",") if s.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--org-id", required=True, help="tenant id used as S3 prefix")
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--route", default=DEFAULT_ROUTE,
                    help=f"chat-explore route (default: {DEFAULT_ROUTE})")
    ap.add_argument("--out-dir", default=None,
                    help="output dir (default: ./thread_<first-rid-short>)")

    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--request-ids",
                   help="comma-separated ids, or @path/to/file with one id per line")
    g.add_argument("--uid", help="auth uid; triggers pup discovery")

    ap.add_argument("--from", dest="frm", help="ISO start (required with --uid)")
    ap.add_argument("--to", dest="to", help="ISO end (required with --uid)")
    ap.add_argument("--audience-id", help="narrow pup discovery to one audience")
    ap.add_argument("--service", default=DEFAULT_SERVICE)
    ap.add_argument("--marker-line", default=DEFAULT_MARKER_LINE,
                    help="log line that fires once per turn, used for dedupe")
    args = ap.parse_args()

    if args.uid and not (args.frm and args.to):
        ap.error("--uid requires --from and --to")

    if args.request_ids:
        ids = parse_request_ids(args.request_ids)
    else:
        ids = discover_request_ids(
            args.uid, args.frm, args.to, args.audience_id,
            args.service, args.marker_line,
        )
        if not ids:
            print("[error] no request_ids found via pup discovery", file=sys.stderr)
            return 1
        print(f"[info] discovered {len(ids)} turns", file=sys.stderr)

    out_dir = Path(args.out_dir or f"./thread_{ids[0][:8]}")
    turns_dir = out_dir / "turns"
    turns_dir.mkdir(parents=True, exist_ok=True)

    s3 = boto3.client("s3")
    fetched: list[Path] = []
    for rid in ids:
        key = s3_log_key(args.org_id, args.route, rid)
        dst = turns_dir / f"{rid}.log"
        if dst.exists() and dst.stat().st_size > 0:
            print(f"[cache] {dst}", file=sys.stderr)
            fetched.append(dst)
            continue
        if download_log(s3, args.bucket, key, dst):
            fetched.append(dst)

    if not fetched:
        print("[error] no .log files downloaded", file=sys.stderr)
        return 1

    stitched = out_dir / "thread.log"
    ordered = stitch(fetched, stitched)
    (out_dir / "request_ids.txt").write_text("\n".join(ids) + "\n")

    print(f"[done] stitched {len(fetched)}/{len(ids)} turns into {stitched}",
          file=sys.stderr)
    for ts, p in ordered:
        print(f"  {ts or 'unknown':<26}  {p.stem}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
