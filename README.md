# dotfiles

Personal development configuration managed by [chezmoi](https://www.chezmoi.io/). One repository and one branch serve every machine.

## Model

Two values decide what gets applied:

- **Profile:** `personal`, `work`, or `server`; selected during `chezmoi init`.
- **OS:** detected automatically by chezmoi.

`personal` and `work` are full workstations. `server` keeps the smaller Bash, Vim, tmux, and agent setup and skips `~/.config`, `~/bin`, and Neovim. Personal Linux machines also receive the Kitty, Niri, and DMS desktop files. The retired `cachygaming` value is treated as `personal` so existing machines keep working.

There are two separate operations:

- `chezmoi apply` synchronizes configuration and keeps managed Pi extension dependencies current.
- `bash "$(chezmoi source-path)/bootstrap"` installs missing packages and performs one-time setup.

## First install

Install chezmoi, choose a profile, and apply the configuration:

```bash
BINDIR="$HOME/.local/bin" sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply regutierrez
export PATH="$HOME/.local/bin:$PATH"
bash "$(chezmoi source-path)/bootstrap"
```

For a server:

```bash
BINDIR="$HOME/.local/bin" sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --promptString profile=server regutierrez
export PATH="$HOME/.local/bin:$PATH"
bash "$(chezmoi source-path)/bootstrap"
```

SSH keys are local to each machine and are never copied from this repository. The platform setup scripts generate a key when needed.

## Daily use

```bash
chezmoi edit ~/.zshrc       # edit the source and apply that target
chezmoi diff                # preview all changes
chezmoi apply -n -v         # dry run
chezmoi apply ~/.zshrc      # apply one target
chezmoi apply               # apply all configuration
```

After changing [`.chezmoidata/packages.toml`](.chezmoidata/packages.toml), install newly listed packages explicitly:

```bash
bash "$(chezmoi source-path)/bootstrap"
```

The package command only ensures packages are present; it does not deliberately upgrade existing Homebrew packages.

## Profiles and skills

Profile behavior lives in [`.chezmoiignore`](.chezmoiignore). Skill membership lives in [`.chezmoidata.toml`](.chezmoidata.toml):

- `personal`: shared and desktop skills.
- `work`: shared, work, and desktop skills.
- `server`: shared skills only.

Unclassified skill directories are not installed. Pi-specific files and development notes live under [`dot_pi/agent/`](dot_pi/agent/README.md).

To change profiles, edit `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
profile = "server"
```

## Linux desktop files

Personal Linux machines receive:

- `dot_config/kitty/`
- `dot_config/niri/`
- `dot_config/systemd/user/dms-auto-resolution-profile.service`
- `dot_local/bin/executable_dms-auto-resolution-profile`

`linux/cachyos/setup.sh` remains the CachyOS-specific machine setup script.

## Secrets

Private SSH keys stay on each machine. The repository manages only the personal macOS SSH client configuration; work SSH configuration remains local.

Shell tokens belong in untracked files under `~/.config/secrets/`; `dot_zshrc.tmpl` sources these when present:

- `kagi.env` for `KAGI_API_KEY`
- `sideshow.env` for `SIDESHOW_TOKEN`

## Platform setup

macOS initialization installs the minimum tools and creates a local SSH key:

```bash
sudo -v
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | bash
```

Apply macOS preferences separately:

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/settings.sh | bash
```

The Arch server installer configuration remains available at `linux/arch-srv/user_configuration.json`. Do not run user-scoped setup scripts through `sudo bash`.

If the external Neovim checkout prevents an apply, skip externals temporarily:

```bash
chezmoi apply --exclude externals
```
