# dotfiles

Managed with `chezmoi`. One repo, one branch, all machines.

## Mental model

Two facts decide what a machine gets, and they are orthogonal:

- **profile** (`personal` / `work` / `server` / `cachygaming`) — why the machine exists. Chosen once at `chezmoi init`, stored in `~/.config/chezmoi/chezmoi.toml`.
- **OS** (`.chezmoi.os`) — what it runs. Detected automatically.

So: mac-personal = `personal`+darwin, mac-work = `work`+darwin, cachy-gaming-desktop = `cachygaming`+linux, ubuntu-server = `server`+linux. No per-machine branches, no second dotfiles repo.

Three mechanisms, each with one job:

1. `.chezmoiignore` (templated) — whether a machine gets a file at all (e.g. zed/karabiner only on darwin, kitty/niri only on linux, bootstrap-only scripts/secrets only when `bootstrap=true`).
2. `*.tmpl` files — what's inside a file per machine (`dot_zshrc.tmpl`, `dot_tmux.conf.tmpl`, `dot_gitconfig.tmpl`).
3. `.chezmoidata.toml` — the single place per-profile knobs live (manage_* flags, `exclude_skills`).

## Quick start (no preinstalled chezmoi)

Use the official installer wrapper to init + apply in one shot. It prompts for the profile on first run:

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"bootstrap":true}' "regutierrez"
```

`bootstrap=true` includes bootstrap-only entries:

- package install script (`install-packages.sh`)
- macOS lazygit compatibility link script
- SSH secrets/config on profiles/OSes that allow them

Daily `chezmoi apply` omits those entries.

Non-interactive (servers, scripts):

```bash
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --promptString profile=server --override-data '{"bootstrap":true}' "regutierrez"
```

One-off profile override plus bootstrap:

```bash
chezmoi apply --override-data '{"profile":"work","bootstrap":true}'
```

You can replace `$GITHUB_USERNAME` with a full repo URL, e.g. `"https://github.com/regutierrez/dotfiles.git"`.

## Profile system

Profile behavior is centralized in `.chezmoidata.toml`.

- `profiles.personal`
  - `tmux_plugins = true`
  - `manage_bashrc = false`
  - `manage_vimrc = false`
  - `manage_nvim = true`
  - `manage_bin = true`
  - `manage_dot_config = true`
  - `manage_agents = true` (`~/.agents` is managed)
  - `use_age = true` (decrypts secrets with age key)
- `profiles.work`
  - `tmux_plugins = true`
  - `manage_bashrc = false`
  - `manage_vimrc = false`
  - `manage_nvim = true`
  - `manage_bin = true`
  - `manage_dot_config = true`
  - `manage_agents = true`
  - `use_age = false` (skips secret decryption, no age key needed)
- `profiles.cachygaming`
  - Same base behavior as `personal`
  - Applies CachyOS/Niri/DMS gaming desktop files such as kitty, niri, and the DMS auto-resolution-profile systemd user service
- `profiles.server`
  - `tmux_plugins = false` (same tmux config, no plugins)
  - `manage_bashrc = true` (minimal Bash config)
  - `manage_vimrc = true` (minimal Vim config)
  - `manage_nvim = false`
  - `manage_bin = false`
  - `manage_dot_config = false`
  - `manage_agents = true` (skills filtered via `exclude_skills`)
  - `use_age = true`

### CachyGaming-only managed files

Source of truth: `.chezmoiignore`. These apply only when `.chezmoi.os == "linux"` and `profile == "cachygaming"`:

- `dot_config/kitty/` -> `~/.config/kitty/`
- `dot_config/niri/` -> `~/.config/niri/`
- `dot_config/systemd/user/dms-auto-resolution-profile.service` -> `~/.config/systemd/user/dms-auto-resolution-profile.service`
- `dot_local/bin/executable_dms-auto-resolution-profile` -> `~/.local/bin/dms-auto-resolution-profile`

`linux/cachyos/setup.sh` is Cachy-specific bootstrap, not managed into `$HOME`. Arch AUR desktop packages are not currently `cachygaming`-only.

### Agent behavior and per-machine skills

Pi gets a global prompt addendum from `dot_pi/agent/APPEND_SYSTEM.md` -> `~/.pi/agent/APPEND_SYSTEM.md`. It currently sets terse communication rules and a coding loop: read before editing, fix the source of truth, make the smallest correct change, verify proportional to risk, protect shared workspaces, and report validation honestly.

Each profile has an `exclude_skills` deny-list in `.chezmoidata.toml`. Everything under `.agents/skills/` syncs everywhere by default; a new skill reaches all machines unless you add it to a profile's list:

```toml
[profiles.server]
exclude_skills = ["datadog-investigate", "query-postgres-hz", "query-snowflake-hz", "zoom-out"]
```

### Bootstrap-only entries

Normal `chezmoi apply` is daily-safe. It skips entries that install packages, touch encrypted SSH material, or make one-time compatibility links.

Run bootstrap-only entries explicitly:

```bash
chezmoi apply --override-data '{"bootstrap":true}'
```

Combine with a one-off profile override when needed:

```bash
chezmoi apply --override-data '{"profile":"work","bootstrap":true}'
```

### Packages

All installed packages come from `.chezmoidata/packages.toml`, with sections per package manager (`packages.darwin` formulae/casks + per-profile extras, `packages.arch` repo + AUR, `packages.debian`). `run_onchange_before_install-packages.sh.tmpl` installs them only when `bootstrap=true` is passed to chezmoi — brew on macOS, paru (fallback pacman) on arch, apt on debian/ubuntu.

Add a package to the file, push, then run the bootstrap command on machines that should install it.

The bootstrap scripts (`macos/scripts/init.sh`, `linux/deb-srv/scripts/init.sh`, `linux/arch-srv/user_configuration.json`) only install the minimum needed to get chezmoi running; everything else flows from `packages.toml` when `bootstrap=true` is set.

### Changing a machine's profile

The profile is prompted once at `chezmoi init` and stored in `~/.config/chezmoi/chezmoi.toml`. To change it, edit that file:

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
chezmoi apply -n -v --override-data '{"profile":"work","bootstrap":true}'
```

After `init`, the selected profile is stored in the local chezmoi config, so plain `chezmoi apply` uses it automatically.

## Migrating a machine off arch-dotfiles

`regutierrez/arch-dotfiles` has been absorbed into this repo (kitty, niri, zshrc, gitconfig, lazygit, skills) and is now archive-only. On a machine that used its Makefile symlinks, remove them before the first apply so chezmoi doesn't write through symlinks into the old checkout:

```bash
make -C ~/path/to/arch-dotfiles uninstall 2>/dev/null \
  || for f in ~/.zshrc ~/.gitconfig ~/.config/lazygit/config.yml ~/.config/kitty ~/.config/niri; do
       [ -L "$f" ] && rm "$f"
     done
chezmoi init --apply --override-data '{"bootstrap":true}' regutierrez   # answer: personal
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

The script generates a new SSH key and prints the public key. Add it to GitHub, then apply dotfiles.

Then apply dotfiles (prompts for profile on first run, includes bootstrap-only entries):

```bash
chezmoi init --apply --override-data '{"bootstrap":true}' regutierrez
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
chezmoi apply ~/.zshrc
chezmoi apply
bin/executable_check-dotfiles-docs
```

`chezmoi apply` is daily-safe: it skips bootstrap-only scripts and encrypted SSH secrets unless `--override-data '{"bootstrap":true}'` is supplied.

If `chezmoi apply` fails while updating the external Neovim checkout at `~/.config/nvim`, skip externals:

```bash
chezmoi apply --exclude externals
```
