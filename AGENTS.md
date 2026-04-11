# DOTFILES

Personal dev env managed with [chezmoi](https://www.chezmoi.io/). Zsh + Tmux + age encryption. Two profiles: `desktop` (default) and `server`.

## SKILLS

- Load `.agents/skills/chezmoi/SKILL.md` whenever a task touches dotfiles, chezmoi-managed files, source-state prefixes (`dot_`, `private_`, `encrypted_`, `executable_`), `.chezmoi*` files, templates, profiles, secrets, or `chezmoi` commands.

## STRUCTURE

```
.
├── .chezmoi.toml.tmpl       # Config template (age encryption, editor prefs)
├── .chezmoidata.toml        # Profile definitions (desktop vs server)
├── .chezmoiignore           # Conditional ignore rules by profile/OS
├── dot_zshrc                # → ~/.zshrc
├── dot_bashrc               # → ~/.bashrc (server only)
├── dot_vimrc                # → ~/.vimrc (server only)
├── dot_tmux.conf.tmpl       # → ~/.tmux.conf (templated, plugins toggle by profile)
├── dot_config/              # → ~/.config/ (desktop only)
│   ├── ghostty/             #   Terminal
│   ├── karabiner/           #   macOS key remapping
│   ├── lazygit/             #   Git TUI
│   ├── opencode/            #   AI agent config + commands/skills
│   └── zed/                 #   Editor (macOS only)
├── dot_agents/              # → ~/.agents/ (desktop only) — AI coding skills
├── dot_pi/                  # → ~/.pi/ — Pi agent config, extensions, specs
├── bin/                     # → ~/bin/ (desktop only) — custom scripts
├── private_dot_ssh/         # → ~/.ssh/ (0700) — age-encrypted private key
├── macos/                   # NOT managed — bootstrap & settings scripts
├── linux/                   # NOT managed — Arch/Debian provisioning
└── archive/                 # NOT managed — retired configs
```

## CHEZMOI PREFIXES

| Prefix | Effect |
|--------|--------|
| `dot_` | Becomes `.` in target |
| `private_` | `0600` file / `0700` dir |
| `encrypted_` | Decrypted with age on apply |
| `executable_` | `0755` permissions |
| `.tmpl` suffix | Rendered as Go template |

## PROFILES

Defined in `.chezmoidata.toml`, set per machine in `~/.config/chezmoi/chezmoi.toml`:

| Flag | `desktop` | `server` |
|------|-----------|----------|
| `tmux_plugins` | ✅ | ❌ |
| `manage_bashrc` | ❌ | ✅ |
| `manage_vimrc` | ❌ | ✅ |
| `manage_bin` | ✅ | ❌ |
| `manage_dot_config` | ✅ | ❌ |
| `manage_agents` | ✅ | ❌ |

## COMMANDS

```bash
# Bootstrap
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply regutierrez
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"server"}' regutierrez

# Daily
chezmoi edit ~/.zshrc         # edit + auto-apply
chezmoi diff                  # preview changes
chezmoi apply                 # apply all
chezmoi apply -n -v           # dry-run verbose

# Inspect
chezmoi managed               # list managed files
chezmoi status                # show diffs
chezmoi data                  # dump template data
chezmoi cat ~/.zshrc           # preview rendered output

# Add/remove
chezmoi add ~/.some_config     # start managing
chezmoi add --encrypt ~/.ssh/key  # add encrypted
chezmoi forget ~/.some_config  # stop managing
chezmoi re-add                 # refresh source from target
```

## ENCRYPTION

Age encryption. Identity at `~/.config/chezmoi/key.txt` (restore manually on new machines).
Encrypted files use `encrypted_` prefix + `.age` extension in source.
