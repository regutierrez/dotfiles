#!/usr/bin/env bash
set -euo pipefail

readonly AST_GREP_VERSION=0.43.0

if [[ -n "${AST_GREP_BIN:-}" ]]; then
  exec "$AST_GREP_BIN" "$@"
fi

if command -v ast-grep >/dev/null 2>&1; then
  exec ast-grep "$@"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "ast-grep is unavailable; install @ast-grep/cli@$AST_GREP_VERSION or set AST_GREP_BIN" >&2
  exit 127
fi

exec npx --yes --package "@ast-grep/cli@$AST_GREP_VERSION" ast-grep "$@"
