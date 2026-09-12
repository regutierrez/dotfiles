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
| `agent-tool-description.md` | Custom Tintinweb Agent tool prompt (`toolDescriptionMode: custom`) |
| `keybindings.json` | Pi TUI keybindings |
| `btw.json` | Optional BTW model/thinking overrides |
| `cloak.json` | Secret-masking patterns for `pi-cloak` |
| `mcp.json` | MCP server wiring for the vendored `pi-mcp` extension |
| `models.json` | Caps xAI Grok `contextWindow` at 200k so prompts stay in the cheap tier |
| `subagents.json` | Lean global settings for `@tintinweb/pi-subagents` |
| `package.json` | Shared deps for extensions |
| `agents/` | Custom Tintinweb subagent definitions; prompts are shared and model/reasoning settings render by profile |
| `skills/update-pi/` | Pi update helper skill |
| `intercepted-commands/` | PATH shims used by `uv.ts` |
| `extensions/pi-autoresearch.json` | Disables the `pi-autoresearch` fullscreen dashboard shortcut so it does not take `ctrl+shift+f` from transcript search |
| `extensions/btw/` | `/btw` side threads (`index.ts` + tests) |
| `extensions/pi-multi-pass/` | Local multipass compatibility fork (`/subs`, `/pool`) |
| `extensions/pi-mcp/` | Vendored MCP gateway with emitted-content preservation (own package) |
| `extensions/web-tools/` | `webfetch` + Kagi `websearch` (own package) |
| `extensions/pi-cloak/` | Mask secrets in `read` tool results (`/cloak-status`) |
| `extensions/atuin.ts` | Atuin integration |
| `extensions/cd.ts` | `/cd` move the session to another directory (fork + switch) with autocomplete |
| `extensions/context.ts` | Context helpers |
| `extensions/continue-after-compaction.ts` | Resume after compaction |
| `extensions/loop.ts` | Loop / iteration helper |
| `extensions/review.ts` | Review UI extension |
| `extensions/subagents-lazy-tools.ts` | Keeps ordinary Agent tools available; defers only the SubagentWorkflow schema until subagent/workflow mentions or `/subagents` (not a permission gate) |
| `extensions/inline-skill-mentions/` | Prefix `@skill-name` as `/skill:name` while keeping the original prompt, extra mentions as `skill-context`, and `@` skill autocomplete |
| `extensions/pi-rename/` | First unnamed Herdr TUI prompt + `/pi-rename`: one Luna low call produces a descriptive Pi session name and a tab topic capped at 20 characters. A Linear issue ID/URL overrides the topic with the ticket ID in either profile. The full name mirrors to the Agents panel (`$name2` wraps); the topic goes to `--title` metadata for Auto Title. Names persist across reloads/resumes. No LLM tool or direct tab renames. The command works anywhere; auto-naming and metadata are Herdr-only. |
| `extensions/uv.ts` | Prefers `uv` via intercepted-commands |

## Edit often vs leave alone

**Edit often (hot):**
- `APPEND_SYSTEM.md`, `agent-tool-description.md`, `keybindings.json`, `btw.json`, `cloak.json`, `models.json`, `subagents.json`, `extensions/pi-autoresearch.json`
- `extensions/btw/`
- `extensions/pi-rename/`
- `extensions/subagents-lazy-tools.ts`
- `agents/*.md.tmpl`
- `package.json` (when adding shared deps)

**Leave alone unless intentionally changing (cold / vendored):**
- `extensions/pi-multi-pass/` (local compatibility fork of `pi-multi-pass`; upstream npm package is broken on current Pi)
- `extensions/pi-mcp/` (vendored from `dmmulroy/pi-mcp`; upstream revision and local patch are recorded in `UPSTREAM.md`)
- `extensions/web-tools/` (vendored; has its own `package.json` + tests)
- `extensions/pi-cloak/` (vendored from [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles); edit `cloak.json` for patterns)
- Large single-file extensions: `review.ts`, `loop.ts`, `context.ts`, `atuin.ts`, `uv.ts`

## Vendored MCP gateway

`extensions/pi-mcp/` is the source-managed copy of `dmmulroy/pi-mcp`. Pi discovers its `package.json` entrypoint automatically. A full chezmoi apply runs `run_onchange_after_30-install-pi-mcp.sh.tmpl` to install locked runtime dependencies when its manifest or lockfile changes.

For a targeted apply, install dependencies explicitly because selecting only these targets does not run the hook:

```bash
chezmoi apply ~/.pi/agent/extensions/pi-mcp ~/.pi/agent/settings.json
npm --prefix ~/.pi/agent/extensions/pi-mcp ci --omit=dev
# then in pi: /reload
```

`modify_settings.json` removes the old `git:github.com/dmmulroy/pi-mcp` package registration so only the vendored copy loads. The old checkout under `~/.pi/agent/git/` is left intact to preserve local changes, but is no longer registered. Pi package updates do not update the vendored source. Do not reinstall the Git package alongside it.

For development, run `npm ci` in `dot_pi/agent/extensions/pi-mcp/`, then `npm run check`, `npm run test:unit`, and `npm run smoke`. See its `UPSTREAM.md` before importing upstream changes.

## Session and Herdr names

`/pi-rename` summarizes the latest prompt. `/pi-rename <name>` sets a literal session name; its tab topic is the first four words, or a Linear ticket ID in that name. Pi's `/name` uses the same deterministic tab fallback without another model call. Every topic is capped at 20 characters, including generated names, fallbacks, restored titles and ticket IDs. Auto Title can add numbers and other context outside this Pi topic limit. `/pi-rename --clear` clears the session name, sidebar label and title metadata; Auto Title can then use its other sources.

If Luna is unavailable or returns invalid JSON, the session name falls back to the clipped prompt and the tab topic to its first four words or ticket ID. Herdr clipboard-image paths are removed before naming and ticket extraction, so filenames such as `client-4-clipboard-….png` cannot become topics or false ticket IDs. Ticket extraction checks the full prompt, even when model input is clipped. An issue URL wins over the first bare `TEAM-123` match. Bare matches are a naming heuristic, not a Linear API lookup.

The retired `linear-window-rename` extension is removed on apply. `chezmoi apply` installs Auto Title and unlinks the retired window-number plugin.

## Click file links in Nvim

In Herdr 0.9.0 or newer, `extensions/open-file-links.ts` routes file URLs to the Pi File Opener plugin. Ctrl+click `[source](file:///absolute/path/file.ts#L10-L20)` to open Nvim in a new, automatically zoomed pane in the same tab and select lines 10–20. Use `#L10` for one line, or omit the fragment to open without a selection. Escape clears the selection; `:q` exits Nvim and closes the temporary pane, returning to Pi. This uses Herdr's `overlay` placement, the same full-tab pane mode used by Herdr Annotate's document review. Herdr restores the previous focus and zoom when the editor pane closes. Each click starts a fresh editor; no new tab is created.

Herdr directly handles absolute-path, `file://`, and `pi-file://` links, so opening an existing absolute-path hyperlink does not depend on Pi rewriting it or reloading the extension. Links work in completed and restored messages. Path-like inline code (`~/file.ts`, `/abs/file.ts`, `file:///...`) and prose `~/.../file.ts` paths become clickable; fenced code, relative paths, and non-path inline code stay unchanged. Use an absolute `file://` URL or an absolute path as the Markdown destination, such as `[HANDOFF.md](/tmp/task/HANDOFF.md)`. Encode spaces as `%20`.

The managed zsh configuration enables Pi hyperlinks inside Herdr, except under tmux/screen. An explicit `PI_HYPERLINKS` value takes priority. After applying changes to `~/.zshrc`, `~/.pi/agent/extensions/open-file-links.ts`, and the `~/.local/share/herdr-plugins/pi-file-opener/` plugin files, start Pi from a new shell. For an existing shell, use `PI_HYPERLINKS=1 pi` and resume the session. Herdr must have the Pi File Opener plugin enabled. After changing its manifest, run `herdr plugin link ~/.local/share/herdr-plugins/pi-file-opener`. Existing `pi-files` tabs from the old implementation are left untouched; close them yourself when no longer needed. In a remote Herdr session, install the plugin and Nvim on the remote host.

## Secret masking (`pi-cloak`)

`extensions/pi-cloak/` redacts matching values from `read` tool results before they reach the model. Patterns live in `cloak.json` (applied to `~/.pi/agent/cloak.json`). Check with `/cloak-status` in pi, then `/reload` after edits.

## Secrets (env hooks, not in git)

Tokens stay in untracked files under `~/.config/secrets/`, sourced by zshrc:

```bash
# ~/.config/secrets/kagi.env
export KAGI_API_KEY=…

# ~/.config/secrets/executor.env
export EXECUTOR_API_KEY=…          # work profile, local executor
export EXECUTOR_PERSONAL_API_KEY=…
```

`dot_zshrc.tmpl` sources those files when present. Do not commit them; mode `0600`.

## Notes

- `models.json` overrides built-in xAI Grok `contextWindow` to 200000. xAI bills the whole request at 2x once the prompt reaches 200k tokens. Add a new `modelOverrides` id when Pi ships another Grok model.
- Dependency directories and most lockfiles under `~/.pi/agent` are ignored by chezmoi. The `web-tools` and `pi-mcp` package lockfiles are managed.
- Orphan extensions and retired skill files removed from source are listed in repo `.chezmoiremove` so apply deletes them from the target.
- `~/.pi/agent/extensions/herdr-agent-state.ts` is owned by herdr (not chezmoi); leave it on the target.
- `~/.pi/agent/claude-bridge.json` is leftover from retired `npm:pi-claude-bridge` (not chezmoi); ignore it or delete it locally.
- `~/.pi/agent/settings.json` is machine-local except `doubleEscapeAction`, removal of `npmCommand`, removal of retired `git:github.com/regutierrez/pi-herdr-subagents`, `npm:sideshow`, `npm:pi-claude-bridge`, `npm:@ff-labs/pi-fff`, and the now-vendored `git:github.com/dmmulroy/pi-mcp`, and removal of `claude-bridge/*` from `enabledModels`. `modify_settings.json` keeps those so Pi uses npm.
