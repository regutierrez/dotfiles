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
- `README.md` is human-facing; keep user-visible behavior and setup there. Update `AGENTS.md` only with agent workflow facts (source paths, gates, mappings) — do not duplicate README prose.

## Structure

```text
.
├── .chezmoi.toml.tmpl          # chezmoi config template; profile prompt/data + age config
├── .chezmoidata.toml           # profile flags
├── .chezmoidata/packages.toml  # package source of truth for brew/arch/debian
├── .chezmoiignore              # templated target-path ignore rules
├── .chezmoiexternal.toml       # external git checkout(s), currently nvim
├── dot_zshrc.tmpl              # -> ~/.zshrc
├── dot_config/                 # -> ~/.config/ when profile manages dot_config
├── dot_local/bin/              # -> ~/.local/bin/
├── dot_agents/skills/          # -> ~/.agents/skills/ when profile manages agents
├── dot_pi/                     # -> ~/.pi/ Pi config, extensions, skills
├── bin/                        # -> ~/bin/ when profile manages bin
├── private_dot_ssh/            # -> ~/.ssh/ with private perms; age-encrypted key
├── macos/ linux/               # bootstrap assets; not applied as dotfiles
├── akkio-helpers/              # helper scripts; excluded on work profile
└── archive/ plans/             # not applied
```

## Chezmoi mapping

| Source prefix/suffix | Target effect |
|---|---|
| `dot_` | leading `.` |
| `private_` | `0600` file / `0700` dir |
| `encrypted_` | decrypt with age on apply |
| `executable_` | `0755` perms |
| `.tmpl` | render as Go template |

Example: `dot_config/lazygit/config.yml` -> `~/.config/lazygit/config.yml`. Use `chezmoi source-path <target>` / `chezmoi target-path <source>` when mapping is unclear.

## Profiles

Profiles live in `.chezmoidata.toml`; selected profile is stored in `~/.config/chezmoi/chezmoi.toml` under `[data].profile`. Profile names and CachyGaming-only paths are documented in `README.md`.

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
- non-darwin excludes SSH secrets/config, Karabiner, and Zed.
- non-`cachygaming` Linux excludes Kitty/Niri/DMS desktop files.
- `server` skips `~/.config`, `~/bin`, tmux plugins, nvim, but still manages allow-listed `~/.agents/skills` from its selected skill groups.
- `bootstrap != true` excludes package/lazygit scripts and encrypted SSH secrets/config; encrypted SSH key ignore lists both `.ssh/id_ed25519` and `.ssh/id_ed25519.age`.
- `skill_groups` in `.chezmoidata.toml` defines skill membership; each profile's `skill_groups` list selects what it receives. Unclassified skills are ignored everywhere.

## Skills layout

- `dot_agents/skills/` -> `~/.agents/skills/`; allow-listed through each profile's groups in `.chezmoidata.toml`. Skill behavior details live in each skill's `SKILL.md`; `tmux` and the Sideshow-backed `visual-explainer` are explicit-only, and `batch-rca` uses pi-subagents `general-purpose` workers instead of tmux sessions.
- `dot_pi/agent/` -> `~/.pi/` (`APPEND_SYSTEM.md`, `keybindings.json`, `agents/`, `extensions/`, `skills/`). User-facing Pi setup is documented in `README.md`.
- `archive/skills/` is not managed; retired/reference only.
- `.agents/skills/` is repo-local helpers, not dotfiles.

## Packages

`.chezmoidata/packages.toml` is the package source of truth. `run_onchange_before_install-packages.sh.tmpl` installs during apply only when `bootstrap=true`.

## Commands

```bash
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply -n -v
chezmoi apply            # only when asked
chezmoi apply ~/.zshrc   # prefer specific targets when possible
chezmoi source-path <target>
chezmoi target-path <source>
chezmoi add ~/.some_config
chezmoi re-add ~/.some_config
chezmoi managed
chezmoi status
chezmoi data
chezmoi cat ~/.zshrc
bin/executable_check-dotfiles-docs
```

## Secrets

Age encryption. Identity path: `~/.config/chezmoi/key.txt`.

Encrypted SSH secrets are bootstrap-only: normal `chezmoi apply` skips them; pass `--override-data '{"bootstrap":true}'` to apply them on machines that have the age key. Work profile still skips age secrets via `use_age = false`.

Encrypted source files use `encrypted_` prefix plus `.age`. Keep secrets out of plain-text commits.
