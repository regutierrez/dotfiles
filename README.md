# dotfiles

Personal development configuration managed by [chezmoi](https://www.chezmoi.io/). One repository and one branch serve every machine.

## Model

Two values decide what gets applied:

- **Profile:** `personal` or `work`; selected during `chezmoi init`.
- **OS:** detected automatically by chezmoi.

Both profiles are full workstations. `personal` is used on macOS and on the Fedora gaming workstation; `work` is used on macOS. Personal Fedora also receives the gaming, Kitty, Niri, and DMS configuration.

There are two separate operations:

- `chezmoi apply` synchronizes configuration and keeps managed Pi extension dependencies current when their prerequisites already exist.
- `bash "$(chezmoi source-path)/bootstrap"` installs missing packages and prerequisites, applies the configuration, and performs platform setup.

## First install

Install chezmoi, choose a profile, then let the bootstrap install prerequisites before the first apply. GitHub shorthand uses HTTPS, so public clones and later `chezmoi update` pulls need no authentication:

```bash
BINDIR="$HOME/.local/bin" sh -c "$(curl -fsLS get.chezmoi.io)" -- init regutierrez
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

On Fedora, the bootstrap installs Node and Pi before `chezmoi apply`, so the
`[packages.pi]` hooks install Plannotator and `@tintinweb/pi-subagents` on the first run.

## Amp plugins

Managed Amp plugins live under `dot_config/private_amp/plugins/` and apply to `~/.config/amp/plugins/`:

- `atuin-history.ts` records commands run through Amp's shell tool in Atuin. Entries use `amp` as the author and include the Amp thread ID and title as intent. Atuin supplies the timestamp, working directory, hostname, exit code, and duration.
- `git-ai.ts` records Amp tool edits through git-ai.
- `plannotator.ts` adds Plannotator command-palette actions (review, annotate file, annotate last answer). It needs the `plannotator` CLI on `PATH` (for example `~/.local/bin/plannotator` from the upstream installer).

After apply, run `plugins: reload` in Amp or restart Amp.

View the recorded commands with:

```bash
atuin search --author amp
```

This is command history, not a complete audit log. It does not capture Amp's non-shell tools or command output. An `ssh` command is recorded as the local outer command, not as each command run by the remote shell. Commands that are still running when Amp's shell tool returns only reflect that initial result.

Atuin applies its configured history and secret filters. Even so, do not put secrets directly in command arguments: any command that passes those filters is stored in the local Atuin database and may be synced by Atuin.

## Profiles and skills

Profile behavior lives in [`.chezmoiignore`](.chezmoiignore). Skill membership lives in [`.chezmoidata.toml`](.chezmoidata.toml):

- `personal`: shared skills.
- `work`: shared and work skills.

Pi subagent prompts are shared across profiles, but their model and reasoning settings are rendered per profile from `dot_pi/agent/agents/*.md.tmpl`. Personal uses the OpenCode Go selections; work keeps the original xAI and OpenAI Codex selections.

Unclassified skill directories are not installed. Pi-specific files and development notes live under [`dot_pi/agent/`](dot_pi/agent/README.md).

To change profiles, edit `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
profile = "work"
```

## Fedora desktop files

The personal Fedora workstation receives:

- `dot_config/kitty/`
- `dot_config/niri/`
- `dot_config/systemd/user/dms-auto-resolution-profile.service`
- `dot_local/bin/executable_dms-auto-resolution-profile`

## Secrets

Private SSH keys stay on each machine. The repository manages only public SSH host routing; work SSH configuration and all key material remain local.

Shell tokens belong in untracked files under `~/.config/secrets/`; `dot_zshrc.tmpl` sources `kagi.env` and `sideshow.env` when present.

## Remote GitHub account routing

Set `github_default_account` in chezmoi's machine-local data to the GitHub account used outside a recognized repository. Git operations use HTTPS, and repository owners select Git authors and authenticated `gh` accounts without storing tokens in this repository.

Repository ownership is ambiguous when you fork another owner's repository. The managed `gh` wrapper requires an explicit destination account for that operation:

```bash
GH_ACCOUNT=regutierrez gh repo fork owner/repository
```

`gh auth switch` does not override repository-based account routing in the managed wrapper.

## Platform setup

### Fedora personal workstation

The normal bootstrap reproduces this gaming workstation: RPM Fusion's NVIDIA/Steam/Proton stack, CLI tools, Node, Pi, Zsh and Starship, managed Git identity, a machine-local passwordless Ed25519 key, Herdr, Helium, and Obsidian. It installs prerequisites before the managed configuration, installs only missing software, checks akmods and Secure Boot, and reports rather than performs a required reboot.

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

If the external Neovim checkout prevents an apply, skip externals temporarily:

```bash
chezmoi apply --exclude externals
```
