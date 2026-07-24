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
- `dot_agents/skills/`: managed `~/.agents/skills`.
- `dot_pi/agent/`: managed Pi agents, extensions, and configuration.
- `private_dot_ssh/private_config`: managed personal macOS SSH client configuration, not a private key.
- `macos/` and `linux/`: source-only machine setup.

## Profiles

The supported profiles are `personal`, `work`, and `server`. The selected value is stored under `[data].profile` in `~/.config/chezmoi/chezmoi.toml`.

- Personal and work are workstation profiles.
- Server skips `~/.config` and `~/bin` but still receives shared agent skills.
- Personal Linux receives Kitty, Niri, and DMS desktop files.
- `cachygaming` is accepted only as a legacy alias for `personal`.
- Work alone receives the `work` skill group and `akkio-helpers/`.

Skill directories are allow-listed from groups in `.chezmoidata.toml`. Unclassified skills are ignored everywhere.

## Packages and secrets

System package installation is never part of `chezmoi apply`; Pi extension hooks remain separate. Render and run the explicit source bootstrap with:

```bash
bash "$(chezmoi source-path)/bootstrap"
```

SSH private keys are machine-local and must never be added to this repository. Shell tokens belong in untracked `~/.config/secrets/*.env` files sourced by `dot_zshrc.tmpl`.

## Validation

```bash
chezmoi cat ~/.zshrc
chezmoi diff
chezmoi apply -n -v
chezmoi apply ~/.zshrc   # only when asked
bin/executable_check-dotfiles-docs
```

`.chezmoiremove` is reserved for retired managed targets. Never add machine-local SSH keys or other user data to it.
