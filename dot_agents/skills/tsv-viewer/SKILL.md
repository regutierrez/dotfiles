---
name: tsv-viewer
description: Open a TSV file in the browser as a sortable, filterable table with one command — no server, no dependencies. Use when the user wants to look at, explore, or eyeball TSV / tab-separated data interactively instead of reading raw text, or asks to "open this TSV in a viewer".
---

# TSV Viewer

A single self-contained HTML page (vanilla JS, works offline on `file://`) that shows a TSV as a table with:

- click a column header to sort (numeric columns sort as numbers, second click flips direction)
- a filter box under each header, plus a global search box
- rows rendered 500 at a time so big files stay responsive

## Open a file

```bash
~/.claude/skills/tsv-viewer/scripts/tsv-view.sh path/to/file.tsv
```

That's it — it opens in the user's default browser (`$BROWSER` if set, else `open` / `xdg-open`). The script writes a temporary standalone HTML file with the TSV embedded inside it (plain base64), so it needs no server, no python, no modern browser APIs, and has no URL-length limit. It prints the generated HTML path as the last line of output.

To open it in a tab you control instead (e.g. for screenshots), pass `--no-open` so the user's browser doesn't also pop up, and use the printed path:

```bash
html="$(~/.claude/skills/tsv-viewer/scripts/tsv-view.sh --no-open file.tsv | tail -1)"
chrome-devtools new_page "file://$html" --background true
```

Any other browser-automation tool works the same way — the only contract is "open the printed HTML file".

## Limits and fallbacks

- **TSV only.** For CSV, convert first (tabs in fields will break a naive swap; for clean data `tr ',' '\t'` is enough).
- The generated HTML embeds the data as base64 (~1.33× the TSV size), streamed to disk so there is no command-line length limit. Fine up to tens of MB; beyond that the browser gets slow — serve the directory over HTTP and use the `file=` parameter instead.
- URL parameters are still supported for manual use: `#gz=`, `#data=`, `?gz=`, `?data=`, `name=`, and `file=`. Base64 may be regular or URL-safe, padding optional. The `gz=` form needs a browser with `DecompressionStream` (any current one).
- The page also accepts drag-and-drop or a file picker if the user wants to load a different file by hand.
