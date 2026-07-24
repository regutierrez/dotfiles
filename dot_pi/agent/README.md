# Pi agent (`~/.pi/agent`)

Managed via chezmoi from `dot_pi/agent/`. After sync:

```bash
cd ~/.pi/agent && npm install
# then in pi: /reload
```

## Inventory (what exists)

| Path | Role |
|---|---|
| `APPEND_SYSTEM.md` | Global prompt addendum |
| `keybindings.json` | Pi TUI keybindings |
| `btw.json` | Optional BTW model/thinking overrides |
| `claude-bridge.json` | Claude bridge config |
| `_mcp.json` | MCP server wiring |
| `package.json` | Shared deps for extensions |
| `agents/` | Custom `pi-subagents` agents |
| `skills/update-pi/` | Pi update helper skill |
| `intercepted-commands/` | PATH shims used by `uv.ts` |
| `extensions/btw/` | `/btw` side threads (`index.ts` + tests) |
| `extensions/web-tools/` | `webfetch` + Kagi `websearch` (own package) |
| `extensions/cpimg/` | Clipboard image helper |
| `extensions/answer.ts` | `/answer` + `ctrl+.` Q&A from last assistant reply |
| `extensions/atuin.ts` | Atuin integration |
| `extensions/context.ts` | Context helpers |
| `extensions/continue-after-compaction.ts` | Resume after compaction |
| `extensions/git-ai.ts` | Git AI helpers |
| `extensions/loop.ts` | Loop / iteration helper |
| `extensions/review.ts` | Review UI extension |
| `extensions/uv.ts` | Prefers `uv` via intercepted-commands |

## Edit often vs leave alone

**Edit often (hot):**
- `APPEND_SYSTEM.md`, `keybindings.json`, `btw.json`
- `extensions/btw/`
- `extensions/answer.ts`
- `agents/*.md`
- `package.json` (when adding shared deps)

**Leave alone unless intentionally changing (cold / vendored):**
- `extensions/web-tools/` (vendored; has its own `package.json` + tests)
- Large single-file extensions: `review.ts`, `loop.ts`, `context.ts`, `git-ai.ts`, `atuin.ts`, `uv.ts`, `cpimg/`

## Secrets (env hooks, not in git)

Public values can live in `dot_zshrc.tmpl` (e.g. `SIDESHOW_URL`). Tokens stay in untracked files under `~/.config/secrets/`, sourced by zshrc:

```bash
# ~/.config/secrets/kagi.env
export KAGI_API_KEY=…

# ~/.config/secrets/sideshow.env
export SIDESHOW_TOKEN=…
```

`dot_zshrc.tmpl` already sources both when present. Do not commit those files; mode `0600`.

## Notes

- `node_modules/` and lockfiles under `~/.pi/agent` are ignored by chezmoi.
- Orphan extensions removed from source are listed in repo `.chezmoiremove` so apply deletes them from the target.
- `~/.pi/agent/extensions/herdr-agent-state.ts` is owned by herdr (not chezmoi); leave it on the target.
