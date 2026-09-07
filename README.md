# dotfiles

Personal development configuration managed by [chezmoi](https://www.chezmoi.io/). One repository and one branch serve every machine.

## Model

Two values decide what gets applied:

- **Profile:** `personal` or `work`; selected during `chezmoi init`.
- **OS:** detected automatically by chezmoi.

Both profiles are full workstations. `personal` is used on macOS and on the Fedora gaming workstation; `work` is used on macOS. Personal Fedora also receives the gaming configuration.

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

Both workstation profiles install [terminal-browser](https://github.com/zenbu-labs/terminal-browser) with the official curl installer (`scripts/install-terminal-browser.sh`), not Homebrew or DNF. When Herdr is present, that script also installs the `zenbu-labs.terminal-browser` plugin. In Herdr, `prefix+shift+b` opens a browser split. `prefix+b` stays the sidebar toggle. Upgrade with `terminal-browser upgrade`. Do not `brew install terminal-browser`; that would fight the curl install.

After changing [`.chezmoidata/packages.toml`](.chezmoidata/packages.toml), install newly listed packages explicitly:

```bash
bash "$(chezmoi source-path)/bootstrap"
```

The bootstrap only installs missing packages and applications. It does not run a broad system, Homebrew, or Flatpak upgrade.

On macOS, both workstation profiles install Karabiner-Elements and render the matching
personal or work configuration; Karabiner is ignored on other operating systems.

On Fedora, the bootstrap installs Node and Pi before `chezmoi apply`, so the
`[packages.pi]` hooks install Plannotator and `@tintinweb/pi-subagents` on the first run.

## Herdr tab titles

[Auto Title](https://github.com/kryptamine/herdr-auto-title) owns generated tab names and workspace-local window numbers. Install the reviewed version on each machine (requires Herdr 0.8.2+ and Go 1.24+):

```bash
herdr plugin install kryptamine/herdr-auto-title --ref a34f22d1fc8a6037d171789cfda17289088527e0 --yes
```

Apply the Pi changes before starting Auto Title: `pi-rename` reports a descriptive sidebar name and a separate terse title, and chezmoi removes the competing `linear-window-rename` extension. The window-number link hook now keeps `dotfiles.window-numbers` disabled; on an existing machine you can also run `herdr plugin disable dotfiles.window-numbers` when ready to switch. Do not run both title writers together.

Auto Title starts on the next Herdr server startup, not on install or client reattach. Restart only when it is safe to stop the session and its pane processes. Reload Pi after applying its extension changes.

Defaults poll every 500 ms and keep the window position prefix. Optional settings live in `~/.config/herdr-auto-title/config.env` on Linux or `~/Library/Application Support/herdr-auto-title/config.env` on macOS, **not** the config directory printed by `herdr plugin install`. Keep `HERDR_AUTO_TITLE_POSITION=true`. Set `HERDR_AUTO_TITLE_AGENT_NAME=false` to omit the agent name if desired.

Pi's first unnamed session prompt generates two names in one Luna call. The short title becomes just `TRI-1234` when the prompt contains that ticket or its Linear URL; the full Pi session/sidebar name remains descriptive. Auto Title may still add directory, branch, agent and number context around the short topic. For split tabs, its selected pane determines the topic.

Upstream caveats: manually renamed tabs stop auto-updating, including their numbers. Clearing the tab name restores automatic naming. On first startup, existing custom names without a saved Auto Title lock can be overwritten. Generated titles retain numbers; this is not the old plugin's guarantee for manually named tabs.

## Amp plugins

Managed Amp plugins live under `dot_config/private_amp/plugins/` and apply to `~/.config/amp/plugins/`:

- `atuin-history.ts` records commands run through Amp's shell tool in Atuin. Entries use `amp` as the author and include the Amp thread ID and title as intent. Atuin supplies the timestamp, working directory, hostname, exit code, and duration.
- `herdr-runner-label.ts` shows Herdr-managed Amp runners as `amp (runner) - N threads`, using Amp's live runner thread count.
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
- `work`: shared and work skills, plus `akkio-helpers/`. Linear-aware Pi title metadata is shared by both profiles.

Pi subagent prompts are shared across profiles, but their model and reasoning settings are rendered per profile from `dot_pi/agent/agents/*.md.tmpl`. Personal uses the OpenCode Go selections; work keeps the original xAI and OpenAI Codex selections.

Unclassified skill directories are not installed. Pi-specific files and development notes live under [`dot_pi/agent/`](dot_pi/agent/README.md).

To change profiles, edit `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
profile = "work"
```

## Secrets

Private SSH keys stay on each machine. The repository manages only public SSH host routing; work SSH configuration and all key material remain local.

Shell tokens belong in untracked files under `~/.config/secrets/`; `dot_zshrc.tmpl` sources `kagi.env` when present.

## Remote GitHub account routing

Set `github_default_account` in chezmoi's machine-local data to the GitHub account used outside a recognized repository. Git operations use HTTPS, and repository owners select Git authors and authenticated `gh` accounts without storing tokens in this repository.

Repository ownership is ambiguous when you fork another owner's repository. The managed `gh` wrapper requires an explicit destination account for that operation:

```bash
GH_ACCOUNT=regutierrez gh repo fork owner/repository
```

`gh auth switch` does not override repository-based account routing in the managed wrapper.

## Platform setup

### Fedora personal workstation

The normal bootstrap reproduces this gaming workstation: RPM Fusion's NVIDIA/Steam/Proton stack, CLI tools, Node, Pi, Zsh and Starship, managed Git identity, a machine-local passwordless Ed25519 key, Herdr, terminal-browser, Helium, and Obsidian. It installs prerequisites before the managed configuration, installs only missing software, checks akmods and Secure Boot, and reports rather than performs a required reboot.

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
