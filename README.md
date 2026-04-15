# dotfiles

Managed with `chezmoi`.

## Quick start (no preinstalled chezmoi)

Use the official installer wrapper to init + apply in one shot.

### Personal profile

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"personal"}' "regutierrez"
```

### Work profile

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"work"}' "regutierrez"
```

### Server profile


You can replace `$GITHUB_USERNAME` with a full repo URL, e.g. `"https://github.com/regutierrez/dotfiles.git"`.

## Profile system

Profile behavior is centralized in `.chezmoidata.toml`.

- `profiles.personal`
  - `tmux_plugins = true`
  - `manage_bashrc = false`
  - `manage_vimrc = false`
  - `manage_bin = true`
  - `manage_dot_config = true`
  - `manage_agents = true` (`~/.agents` is managed)
  - `use_age = true` (decrypts secrets with age key)
- `profiles.work`
  - `tmux_plugins = true`
  - `manage_bashrc = false`
  - `manage_vimrc = false`
  - `manage_bin = true`
  - `manage_dot_config = true`
  - `manage_agents = true`
  - `use_age = false` (skips secret decryption, no age key needed)
- `profiles.server`
  - `tmux_plugins = false` (same tmux config, no plugins)
  - `manage_bashrc = true` (minimal Bash config)
  - `manage_vimrc = true` (minimal Vim config)
  - `manage_bin = false`
  - `manage_dot_config = false`
  - `manage_agents = false`
  - `use_age = true`

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
chezmoi apply -n --override-data '{"profile":"personal"}'
chezmoi apply -n --override-data '{"profile":"work"}'
```

## arch bootstrap
> you probably need to re-fix partitions, but other than that should be good to go.
```bash
archinstall --config-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_configuration.json --creds-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_credentials.json
```

## macOS bootstrap

The script needs sudo access for Xcode CLI Tools. Warm up the session first, then run without sudo:

```bash
sudo -v
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | bash
```

> Do not pipe into `sudo bash` — user-scoped tools (Homebrew, SSH keys) must install as your user. The script calls `sudo` internally only when needed.

The script generates a new SSH key and prints the public key. Add it to GitHub, then apply dotfiles:

```bash
chezmoi init --apply regutierrez
```

To use the work package set from the repo (`macos/scripts/bootstrap.sh`):

```bash
sudo -v
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/bootstrap.sh > /tmp/bootstrap.sh && \
  curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | BOOTSTRAP_CONFIG=/tmp/bootstrap.sh bash
```

## Apply macOS settings

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/settings.sh | bash
```

> Do not run with `sudo bash` — trackpad and other user preferences must be written as your user. The script calls `sudo` internally for system-level settings (e.g. `systemsetup -setrestartfreeze`).

## Daily use

```bash
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply
```
