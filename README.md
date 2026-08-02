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

Install chezmoi, choose a profile, and apply the configuration. GitHub shorthand uses HTTPS, so public clones and later `chezmoi update` pulls need no authentication:

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

The bootstrap only installs missing packages and applications. It does not run a broad system, Homebrew, or Flatpak upgrade.

On macOS, both workstation profiles install Karabiner-Elements and render the matching
personal or work configuration; Karabiner is ignored on other operating systems.

On personal and work machines, `chezmoi apply` installs the `[packages.pi]` entries
when Pi is available, including Plannotator and Herdr subagents.

## Amp shell history

The managed Amp plugin at `~/.config/amp/plugins/atuin-history.ts` records commands run through Amp's shell tool in Atuin. Entries use `amp` as the author and include the Amp thread ID and title as intent. Atuin supplies the timestamp, working directory, hostname, exit code, and duration.

View the recorded commands with:

```bash
atuin search --author amp
```

This is command history, not a complete audit log. It does not capture Amp's non-shell tools or command output. An `ssh` command is recorded as the local outer command, not as each command run by the remote shell. Commands that are still running when Amp's shell tool returns only reflect that initial result.

Atuin applies its configured history and secret filters. Even so, do not put secrets directly in command arguments: any command that passes those filters is stored in the local Atuin database and may be synced by Atuin.

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

Shell tokens belong in untracked files under `~/.config/secrets/`; `dot_zshrc.tmpl` sources `kagi.env` and `sideshow.env` when present.

## Platform setup

### Fedora KDE personal workstation

The normal bootstrap reproduces this workstation: Fedora KDE packages, RPM Fusion's NVIDIA/Steam/Proton stack, CLI tools, Zsh and Starship, managed Git identity, a machine-local passwordless Ed25519 key, Herdr, Helium, Obsidian, KDE repeat/power/PolicyKit settings, and the Caps Lock window/application layer. It installs only missing software, checks akmods and Secure Boot, and reports rather than performs a required reboot.

It never formats or mounts disks, modifies `/etc/fstab`, chooses a Steam library, copies credentials, or stores private SSH keys. The existing 4 TB ext4 Steam drive at `/mnt/storage` remains manual and outside this automation.

### macOS

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
