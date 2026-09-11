# DOTFILES

Personal development configuration managed with chezmoi. Source state lives in this repository; rendered targets usually live under `$HOME`.

## Working rules

- Edit source files here, not live targets, unless the user asks otherwise.
- Think in this order: target path → source path → rendered output.
- Preview with `chezmoi cat <target>`, `chezmoi diff`, or `chezmoi apply -n -v`.
- Do not run a real `chezmoi apply` unless asked. Prefer applying one target.
- Use `chezmoi re-add <target>` when an externally edited target should become source truth.
- Run `chezmoi doctor` before debugging surprising chezmoi behavior.
- Keep `run_` and `run_onchange_` scripts idempotent.
- Keep user-facing setup in `README.md`; keep only agent workflow facts here.

## Source mapping

| Source form | Target effect |
|---|---|
| `dot_` | leading `.` |
| `private_` | private permissions |
| `executable_` | executable permissions |
| `.tmpl` | Go-template rendering |

Example: `dot_config/lazygit/config.yml` maps to `~/.config/lazygit/config.yml`. Use `chezmoi source-path` and `chezmoi target-path` when unclear.

Important locations:

- `.chezmoiignore`: profile and OS gates, written as target paths.
- `.chezmoidata.toml`: skill-group membership only.
- `.chezmoidata/packages.toml`: package source of truth.
- `bootstrap` and `scripts/`: source-only package and one-time setup; never applied into `$HOME`.
- `scripts/install-terminal-browser.sh`: curl installer for the terminal-browser binary; not a brew or RPM package.
- `scripts/install-herdr-plugins.sh`: GitHub Herdr plugin installer used by apply and bootstrap. Unpinned plugins are reinstalled on every run so they track their default branch (Herdr has no `plugin update`); Auto Title is pinned to a commit, skipped once at that commit, and unlinks retired `dotfiles.window-numbers`. Standalone Plannotator TUI stays in the platform package flow.
- `run_after_50-install-herdr-plugins.sh.tmpl`: during `chezmoi apply`, install or update GitHub Herdr plugins and relink local plugins that are missing.
- `run_after_60-remove-retired-herdr-plugins.sh.tmpl`: during `chezmoi apply`, uninstall retired Herdr plugins (`cloudmanic.herdr-plus`, `zenbu-labs.terminal-browser`, `dotfiles.workspace-mru`) and remove leftover config and plugin-state dirs.
- `dot_agents/skills/`: managed `~/.agents/skills`.
- `dot_claude/modify_settings.json`: managed Claude Code token-trim keys in `~/.claude/settings.json`. Matt Pocock's disable flags and bare tool denies, extra unused-tool denies (`Monitor`, worktrees, `ListAgents`, `SendUserFile`, `ShareOnboardingGuide`), plus Theo's `autoMemoryEnabled: false`. Model, theme, effort, and other keys stay machine-local.
- `modify_private_dot_claude.json`: merges the `executor` (work, local) and `executor-personal` MCP servers into machine-local `~/.claude.json`, mirroring Pi (`dot_pi/agent/mcp.json.tmpl`). Amp MCP stays machine-local. Everything else in that file (sign-in, project state, history) stays machine-local, and the merge rewrites key order, so do not apply this target while Claude Code is running.
- `dot_claude/system-prompt-fable.md`: Amp Fable prompt adapted for Claude Code tools. `dot_zshrc.tmpl` wraps `claude` with `--system-prompt-file` when that file exists; subcommands skip the flag.
- `dot_pi/agent/`: managed Pi agents, extensions, and configuration.
- `private_dot_ssh/private_config`: managed personal macOS SSH client configuration, not a private key.
- `macos/` and `linux/`: source-only machine setup.

## Profiles

The supported profiles are `personal` and `work`. The selected value is stored under `[data].profile` in `~/.config/chezmoi/chezmoi.toml`.

- Both profiles are for workstations on macOS and Fedora.
- Personal Fedora is the gaming workstation and receives gaming packages plus GNOME/xremap setup.
- Work Fedora does not receive gaming or GNOME workstation setup.
- Work alone receives the `work` skill group and `akkio-helpers/`.
- Both profiles use `pi-rename` for session names and Linear-aware Herdr title metadata. Auto Title owns tab names; the old window-number plugin is retired.

Skill directories are allow-listed from groups in `.chezmoidata.toml`. Unclassified skills are ignored everywhere.

## Packages and secrets

System package installation is never part of `chezmoi apply`. Herdr plugins and Pi packages are. On Fedora, the source bootstrap installs Node and Pi before applying managed Pi extension hooks. Render and run it with:

```bash
bash "$(chezmoi source-path)/bootstrap"
```

SSH private keys are machine-local and must never be added to this repository. Shell tokens belong in untracked `~/.config/secrets/*.env` files sourced by `dot_zshrc.tmpl` (`kagi.env`, `executor.env`).

## Validation

```bash
chezmoi cat ~/.zshrc
chezmoi cat ~/.claude/settings.json
chezmoi diff
chezmoi apply -n -v
chezmoi apply ~/.zshrc   # only when asked
bin/executable_check-dotfiles-docs
```

`.chezmoiremove` is reserved for retired managed targets. Never add machine-local SSH keys or other user data to it.
