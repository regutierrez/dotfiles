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
| `cloak.json` | Secret-masking patterns for `pi-cloak` |
| `mcp.json` | MCP server wiring for `dmmulroy/pi-mcp` |
| `package.json` | Shared deps for extensions |
| `agents/` | Custom herdr-subagent defs; prompts are shared and model/reasoning settings render by profile |
| `skills/update-pi/` | Pi update helper skill |
| `skills/sideshow/` | Local override of `npm:sideshow`: keeps `/skill:sideshow`, disables model auto-invoke |
| `intercepted-commands/` | PATH shims used by `uv.ts` |
| `extensions/pi-autoresearch.json` | Disables the `pi-autoresearch` fullscreen dashboard shortcut so it does not take `ctrl+shift+f` from transcript search |
| `extensions/btw/` | `/btw` side threads (`index.ts` + tests) |
| `extensions/pi-multi-pass/` | Local multipass fork for Pi 0.84 (`/subs`, `/pool`) |
| `extensions/web-tools/` | `webfetch` + Kagi `websearch` (own package) |
| `extensions/pi-cloak/` | Mask secrets in `read` tool results (`/cloak-status`) |
| `extensions/cpimg/` | Clipboard image helper |
| `extensions/atuin.ts` | Atuin integration |
| `extensions/cd.ts` | `/cd` move the session to another directory (fork + switch) with autocomplete |
| `extensions/context.ts` | Context helpers |
| `extensions/continue-after-compaction.ts` | Resume after compaction |
| `extensions/git-ai.ts` | Git AI helpers |
| `extensions/loop.ts` | Loop / iteration helper |
| `extensions/review.ts` | Review UI extension |
| `extensions/sideshow-lazy-tools.ts` | Defers follow-up sideshow tools until the first design-guide or publish call |
| `extensions/inline-skill-mentions/` | Expand mid-prompt `@skill-name` mentions and offer `@` skill autocomplete |
| `extensions/uv.ts` | Prefers `uv` via intercepted-commands |

## Edit often vs leave alone

**Edit often (hot):**
- `APPEND_SYSTEM.md`, `keybindings.json`, `btw.json`, `cloak.json`, `extensions/pi-autoresearch.json`
- `extensions/btw/`
- `agents/*.md.tmpl`
- `package.json` (when adding shared deps)

**Leave alone unless intentionally changing (cold / vendored):**
- `extensions/pi-multi-pass/` (local Pi 0.84 compat fork of `pi-multi-pass`; upstream npm package is broken on current Pi)
- `extensions/web-tools/` (vendored; has its own `package.json` + tests)
- `extensions/pi-cloak/` (vendored from [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles); edit `cloak.json` for patterns)
- Large single-file extensions: `review.ts`, `loop.ts`, `context.ts`, `git-ai.ts`, `atuin.ts`, `uv.ts`, `cpimg/`

## Secret masking (`pi-cloak`)

`extensions/pi-cloak/` redacts matching values from `read` tool results before they reach the model. Patterns live in `cloak.json` (applied to `~/.pi/agent/cloak.json`). Check with `/cloak-status` in pi, then `/reload` after edits.

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
- Orphan extensions and retired skill files removed from source are listed in repo `.chezmoiremove` so apply deletes them from the target.
- `~/.pi/agent/extensions/herdr-agent-state.ts` is owned by herdr (not chezmoi); leave it on the target.
- `~/.pi/agent/claude-bridge.json` is machine-local (not chezmoi); leave it on the target.
- `~/.pi/agent/settings.json` is machine-local except `doubleEscapeAction` and the `npm:sideshow` `skills: []` filter. `modify_settings.json` keeps those so the local sideshow skill does not collide with the package skill.
