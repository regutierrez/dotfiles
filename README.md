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
- `profiles.server`
  - `tmux_plugins = false` (same tmux config, no plugins)
  - `manage_bashrc = true` (minimal Bash config)
  - `manage_vimrc = true` (minimal Vim config)
  - `manage_bin = false`
  - `manage_dot_config = false`

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

1. Restore age identity key to `~/.config/chezmoi/key.txt`
2. `chmod 600 ~/.config/chezmoi/key.txt`
3. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | bash
```

## Apply macOS settings

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/settings.sh | sudo bash
```

## Daily use

```bash
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply
```
