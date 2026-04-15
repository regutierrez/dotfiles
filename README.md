# dotfiles

Managed with `chezmoi`.

## Quick start (no preinstalled chezmoi)

Use the official installer wrapper to init + apply in one shot.

### Server profile

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"server"}' "regutierrez"
```

### Desktop profile

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"desktop"}' "regutierrez"
```

You can replace `$GITHUB_USERNAME` with a full repo URL, e.g. `"https://github.com/regutierrez/dotfiles.git"`.

## Profile system

Profile behavior is centralized in `.chezmoidata.toml`.

- `profiles.desktop`
  - `tmux_plugins = true`
  - `manage_bashrc = false`
  - `manage_vimrc = false`
  - `manage_bin = true`
  - `manage_dot_config = true`
  - `manage_agents = true` (`~/.agents` is managed)
- `profiles.server`
  - `tmux_plugins = false` (same tmux config, no plugins)
  - `manage_bashrc = true` (minimal Bash config)
  - `manage_vimrc = true` (minimal Vim config)
  - `manage_bin = false`
  - `manage_dot_config = false`
  - `manage_agents = false`

Set profile per machine in local config (`~/.config/chezmoi/chezmoi.toml`):

```toml
[data]
profile = "server"
```

## Safe preview / dry run

```bash
chezmoi apply -n
chezmoi apply -n -v
chezmoi apply -n --override-data '{"profile":"server"}'
chezmoi apply -n --override-data '{"profile":"desktop"}'
```

## arch bootstrap
> you probably need to re-fix partitions, but other than that should be good to go.
```bash
archinstall --config-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_configuration.json --creds-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_credentials.json
```

## macOS bootstrap

1. Restore age identity key to `~/.config/chezmoi/key.txt` and ensure it has correct permissions (`chmod 600`).
2. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | sudo bash
```

> `sudo` is required to install Xcode CLI Tools and Homebrew on a fresh machine. The script validates the age key is present before applying dotfiles and exits with a clear error if it's missing.

To use the work package set from the repo (`macos/scripts/bootstrap.sh`):

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/bootstrap.sh > /tmp/bootstrap.sh && curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | sudo BOOTSTRAP_CONFIG=/tmp/bootstrap.sh bash
```

## Apply macOS settings

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/settings.sh | bash
```

> Run with `sudo bash` to apply settings that require root (e.g. `systemsetup -setrestartfreeze`). The script works without sudo but skips those steps.

## Daily use

```bash
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply
```
