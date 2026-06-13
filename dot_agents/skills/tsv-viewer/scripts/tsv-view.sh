#!/bin/bash
# Open a TSV file in the TSV viewer without manual drag-and-drop.
#
# Writes a standalone temporary HTML file with the TSV embedded inside it
# (plain base64), so it:
#   - needs no server and no network
#   - has no URL-length limit (the data never rides in the URL)
#   - works in any browser that runs basic JavaScript (no modern APIs needed)
#   - prints the generated HTML path as the LAST line of output, so any
#     agent can capture it and open it however it likes
#
# Usage: ./tsv-view.sh [--no-open] path/to/file.tsv
#   --no-open   generate the HTML and print its path, but don't launch a browser
set -euo pipefail

do_open=1
if [ "${1:-}" = "--no-open" ]; then do_open=0; shift; fi

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: $0 [--no-open] path/to/file.tsv" >&2
  exit 1
fi

f="$1"
dir="$(cd "$(dirname "$0")" && pwd)"
viewer="$dir/tsv-viewer.html"
name="$(basename "$f")"
safe_name="$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '_')"
out="${TMPDIR:-/tmp}/tsv-viewer-${safe_name}.html"

# Escape the display name for use inside a JS double-quoted string.
js_name="$(printf '%s' "$name" | sed 's/\\/\\\\/g; s/"/\\"/g; s/</\\u003c/g')"

# Splice the embedded data into a copy of the viewer, just before </head>.
# The base64 is streamed straight from the pipe into the file — never held
# in a variable or argument — so the OS argument-length limit doesn't apply;
# file size is bounded only by browser memory.
{
  awk 'index($0, "</head>") { exit } { print }' "$viewer"
  printf '<script>window.__TSV_VIEWER_EMBEDDED__ = {"name":"%s","data":"' "$js_name"
  base64 < "$f" | tr -d '\n=' | tr '+/' '-_'
  printf '"};</script>\n'
  awk 'index($0, "</head>") { found = 1 } found { print }' "$viewer"
} > "$out"

if [ "$do_open" = 1 ]; then
  if [ -n "${BROWSER:-}" ]; then
    "$BROWSER" "$out" >/dev/null 2>&1 &
  elif command -v open >/dev/null; then
    open "$out"
  elif command -v xdg-open >/dev/null; then
    xdg-open "$out"
  else
    echo "No browser launcher found (open/xdg-open/\$BROWSER); HTML was still written." >&2
  fi
fi

echo "$out"
