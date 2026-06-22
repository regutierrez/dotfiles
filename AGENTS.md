# DOTFILES

Personal dev env managed with [chezmoi](https://www.chezmoi.io/). Source state lives in this repo; target state is usually `$HOME`.

## Agent rules

- Prefer editing source files in this repo, not live target files, unless asked.
- Think: target path -> source path -> rendered output.
- Preview before apply with `chezmoi cat <target>`, `chezmoi diff`, or `chezmoi apply -n -v`.
- Do not run real `chezmoi apply` unless asked. When applying, prefer specific targets (`chezmoi apply ~/.zshrc`) over whole-repo apply.
- If target files changed outside chezmoi and should become source truth, use `chezmoi re-add <target>`.
- If behavior is surprising, run `chezmoi doctor` first.
- For encrypted files, do not edit ciphertext directly; use `chezmoi edit` if working from target state.
- Template/gate rules use Go templates; `.chezmoiignore` usually matches target paths, but encrypted entries may need both decrypted target and `.age` path to avoid pre-decrypt errors when encryption is off.
- Bootstrap-only entries are gated by `--override-data '{"bootstrap":true}'`.
- `run_` scripts execute on apply when not ignored; `run_onchange_` runs when contents change; keep scripts idempotent.
- Always update `AGENTS.md` and `README.md` when repo behavior, structure, profiles, bootstrap flow, managed files, packages, or agent/skill layout changes.

## Structure

```text
.
├── .chezmoi.toml.tmpl          # chezmoi config template; profile prompt/data + age config
├── .chezmoidata.toml           # profile flags
├── .chezmoidata/packages.toml  # package source of truth for brew/arch/debian
├── .chezmoiignore              # templated target-path ignore rules
├── .chezmoiexternal.toml       # external git checkout(s), currently nvim
├── dot_zshrc.tmpl              # -> ~/.zshrc
├── dot_zprofile.tmpl           # -> ~/.zprofile
├── dot_gitconfig.tmpl          # -> ~/.gitconfig
├── dot_tmux.conf.tmpl          # -> ~/.tmux.conf
├── dot_bashrc                  # -> ~/.bashrc when profile manages bashrc
├── dot_vimrc                   # -> ~/.vimrc when profile manages vimrc
├── dot_config/                 # -> ~/.config/ when profile manages dot_config
│   ├── finicky/                # URL/browser routing
│   ├── ghostty/                # terminal
│   ├── gh-dash/                # GitHub dashboard
│   ├── git/                    # git config fragments
│   ├── karabiner/              # macOS key remapping
│   ├── kitty/                  # Linux/CachyGaming terminal
│   ├── lazygit/                # Git TUI
│   ├── niri/                   # Linux/CachyGaming compositor config
│   ├── opencode/               # opencode commands/config
│   ├── process-compose/        # process-compose config
│   ├── ripgrep/                # ripgrep config
│   ├── sesh/                   # session config
│   ├── systemd/user/           # user services
│   ├── television/             # television config
│   ├── tmux/                   # tmux extras
│   ├── uv/                     # uv config
│   ├── worktrunk/              # worktree tooling config
│   └── zed/                    # editor config, darwin only
├── dot_local/bin/              # -> ~/.local/bin/
├── dot_agents/skills/          # -> ~/.agents/skills/ when profile manages agents
├── dot_pi/                     # -> ~/.pi/ Pi config, extensions, specs, Pi-specific skills
├── bin/                        # -> ~/bin/ when profile manages bin
├── private_dot_ssh/            # -> ~/.ssh/ with private perms; age-encrypted key
├── Library/LaunchAgents/       # -> ~/Library/LaunchAgents/ on darwin
├── macos/                      # bootstrap/settings scripts; not applied as dotfiles
├── linux/                      # Arch/Debian/Cachy bootstrap assets; not applied as dotfiles
├── akkio-helpers/              # helper scripts; excluded on work profile
├── plans/                      # design/handoff notes; not applied
└── archive/                    # retired configs/skills; not applied
```

## Chezmoi mapping

| Source prefix/suffix | Target effect |
|---|---|
| `dot_` | leading `.` |
| `private_` | `0600` file / `0700` dir |
| `encrypted_` | decrypt with age on apply |
| `executable_` | `0755` perms |
| `.tmpl` | render as Go template |

Examples:

- `dot_zshrc.tmpl` -> `~/.zshrc`
- `dot_config/lazygit/config.yml` -> `~/.config/lazygit/config.yml`
- `private_dot_ssh/private_config` -> `~/.ssh/config`
- `bin/executable_uuid` -> `~/bin/uuid`

Use `chezmoi source-path <target>` / `chezmoi target-path <source>` when mapping is unclear.

## Profiles

Profiles live in `.chezmoidata.toml`; selected profile is stored in `~/.config/chezmoi/chezmoi.toml` under `[data].profile`.

| Flag | personal | work | cachygaming | server |
|---|---:|---:|---:|---:|
| `tmux_plugins` | yes | yes | yes | no |
| `manage_bashrc` | no | no | no | yes |
| `manage_vimrc` | no | no | no | yes |
| `manage_nvim` | yes | yes | yes | no |
| `manage_bin` | yes | yes | yes | no |
| `manage_dot_config` | yes | yes | yes | no |
| `manage_agents` | yes | yes | yes | yes |
| `use_age` | yes | no | yes | yes |

`.chezmoiignore` gates by OS/profile/bootstrap using target paths, not source paths.

Notable gates:

- `work` excludes `akkio-helpers/`.
- non-darwin excludes SSH secrets/config, Karabiner, Zed, LaunchAgents.
- non-`cachygaming` Linux excludes Kitty/Niri/DMS desktop files.
- `server` skips `~/.config`, `~/bin`, tmux plugins, nvim, but still manages filtered `~/.agents/skills`.
- `bootstrap != true` excludes package/lazygit scripts and encrypted SSH secrets/config; encrypted SSH key ignore lists both `.ssh/id_ed25519` and `.ssh/id_ed25519.age`.
- `exclude_skills` in `.chezmoidata.toml` denies selected skills per profile.

### CachyGaming-only managed files

Only when `.chezmoi.os == "linux"` and `profile == "cachygaming"`:

- `dot_config/kitty/` -> `~/.config/kitty/`
- `dot_config/niri/` -> `~/.config/niri/`
- `dot_config/systemd/user/dms-auto-resolution-profile.service` -> `~/.config/systemd/user/dms-auto-resolution-profile.service`
- `dot_local/bin/executable_dms-auto-resolution-profile` -> `~/.local/bin/dms-auto-resolution-profile`

`linux/cachyos/setup.sh` is Cachy-specific bootstrap, not managed into `$HOME`. Arch AUR desktop packages are not currently `cachygaming`-only.

## Skills layout

- `dot_agents/skills/` -> `~/.agents/skills/`; main coding-agent skills, filtered by profile `exclude_skills`.
- `dot_pi/agent/APPEND_SYSTEM.md` -> `~/.pi/agent/APPEND_SYSTEM.md`; Pi global behavior addendum: terse communication plus read/edit/verify/workspace-safety loop.
- `dot_pi/agent/skills/` -> `~/.pi/agent/skills/`; Pi-specific skills.
- `archive/skills/` is not managed; retired/reference skills only.
- Repo-local helper skills for agents live under `.agents/skills/` and are not target-state dotfiles.

## Packages

`.chezmoidata/packages.toml` is the package source of truth.

`run_onchange_before_install-packages.sh.tmpl` installs packages during apply only when `bootstrap=true` is set:

- macOS: Homebrew formulae/casks
- Arch/CachyOS: `paru` when available, fallback `pacman`
- Debian/Ubuntu: `apt`

Bootstrap scripts install only enough to get chezmoi running; packages flow from `packages.toml` when chezmoi runs with `--override-data '{"bootstrap":true}'`.

## Commands

```bash
# Bootstrap; prompts for profile, includes bootstrap-only scripts/secrets
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"bootstrap":true}' regutierrez

# Non-interactive profile select
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --promptString profile=server --override-data '{"bootstrap":true}' regutierrez

# One-off profile + bootstrap override
chezmoi apply --override-data '{"profile":"work","bootstrap":true}'

# Daily; skips bootstrap-only scripts and encrypted SSH secrets
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply -n -v
chezmoi apply            # only when asked
chezmoi apply ~/.zshrc   # prefer specific targets when possible

# Inspect
chezmoi managed
chezmoi status
chezmoi data
chezmoi cat ~/.zshrc

# Add/remove/update source from target
chezmoi add ~/.some_config
chezmoi add --encrypt ~/.ssh/key
chezmoi forget ~/.some_config
chezmoi re-add ~/.some_config

# Doc drift check from source repo
bin/executable_check-dotfiles-docs
```

## Secrets

Age encryption. Identity path: `~/.config/chezmoi/key.txt`.

Encrypted SSH secrets are bootstrap-only: normal `chezmoi apply` skips them; pass `--override-data '{"bootstrap":true}'` to apply them on machines that have the age key. Work profile still skips age secrets via `use_age = false`.

Encrypted source files use `encrypted_` prefix plus `.age`. Keep secrets out of plain-text commits.
