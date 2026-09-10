# dotfiles

Personal development configuration managed by [chezmoi](https://www.chezmoi.io/). One repository and one branch serve every machine.

## Model

Two values decide what gets applied:

- **Profile:** `personal` or `work`; selected during `chezmoi init`.
- **OS:** detected automatically by chezmoi.

Both profiles are full workstations on macOS and Fedora. `personal` Fedora is the gaming workstation and receives gaming plus GNOME/xremap setup; `work` Fedora does not.

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

Clone development repositories with `git wt-clone` so the default branch and
future Worktrunk branches are peers under one project directory:

```bash
cd ~/repos
git wt-clone https://github.com/owner/project.git

# ~/repos/project/
# ├── .bare/      shared bare repository metadata
# ├── .git        pointer to .bare
# └── main/       default branch worktree
```

An optional second argument sets the project directory. Ordinary `git clone`
keeps its standard behavior for tools and workflows that need a conventional
checkout.

Both workstation profiles install [terminal-browser](https://github.com/zenbu-labs/terminal-browser) with the official curl installer (`scripts/install-terminal-browser.sh`), not Homebrew or DNF. Upgrade with `terminal-browser upgrade`. Do not `brew install terminal-browser`; that would fight the curl install.

`chezmoi apply` installs [Herdr Annotate](https://github.com/plannotator/herdr-annotate), [Auto Title](https://github.com/kryptamine/herdr-auto-title), and [hseh](https://github.com/regutierrez/hseh) when Herdr is present, and reinstalls the unpinned ones (Annotate, hseh) on every apply so they track their latest commit. Bootstrap runs the same installers. `prefix+w` opens the hseh space picker. The standalone [Plannotator TUI](https://github.com/plannotator/plannotator-tui) stays in the platform package flow: macOS uses the trusted `plannotator/tap` Homebrew formula, and Fedora installs the Rust crate. Managed settings open document reviews as a full-tab Herdr overlay. Use `prefix+o` to review a file or folder and `prefix+shift+o` to review the agent's last reply.

After changing [`.chezmoidata/packages.toml`](.chezmoidata/packages.toml), install newly listed packages explicitly:

```bash
bash "$(chezmoi source-path)/bootstrap"
```

The bootstrap only installs missing packages and applications. It does not run a broad system, Homebrew, or Flatpak upgrade.

On macOS, both workstation profiles install Karabiner-Elements and render the matching
personal or work configuration; Karabiner is ignored on other operating systems.

On Fedora, the bootstrap installs Node and Pi before `chezmoi apply`, so the
`[packages.pi]` hooks install Plannotator and `@tintinweb/pi-subagents` on the first run.
The same apply also installs GitHub Herdr plugins and relinks missing local Herdr plugins.

## Herdr tab titles

[Auto Title](https://github.com/kryptamine/herdr-auto-title) owns generated tab names and workspace-local window numbers. `chezmoi apply` installs the reviewed plugin (Herdr 0.8.2+ and Go 1.24+) and unlinks retired `dotfiles.window-numbers`:

```bash
herdr plugin install kryptamine/herdr-auto-title --ref a34f22d1fc8a6037d171789cfda17289088527e0 --yes
```

Apply the Pi changes before starting Auto Title: `pi-rename` reports a descriptive sidebar name and a separate terse title, and chezmoi removes the competing `linear-window-rename` extension. The old window-number plugin and its install hook are retired. Do not run both title writers together.

Auto Title starts on the next Herdr server startup, not on install or client reattach. Restart only when it is safe to stop the session and its pane processes. Reload Pi after applying its extension changes.

Auto Title polls every 500 ms by default. Managed settings keep `HERDR_AUTO_TITLE_POSITION=true` and set `HERDR_AUTO_TITLE_AGENT_NAME=false`: show the window number, but omit the agent name. Settings live in `~/.config/herdr-auto-title/config.env` on Linux or `~/Library/Application Support/herdr-auto-title/config.env` on macOS, **not** the config directory printed by `herdr plugin install`. Config changes take effect when the plugin process restarts; Herdr has no plugin-restart CLI command.

Pi's first unnamed session prompt generates two names in one Luna call. The short title becomes just `TRI-1234` when the prompt contains that ticket or its Linear URL; the full Pi session/sidebar name remains descriptive. Pi topics are capped at 20 characters and omit harness-name prefixes. Auto Title may still add directory, branch and number context around the short topic. For split tabs, its selected pane determines the topic.

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

## Claude Code

User settings at `~/.claude/settings.json` are partially managed. Apply keeps [Matt Pocock's](https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt) disable flags and bare tool-deny list, extra unused-tool denies (`Monitor`, worktrees, `ListAgents`, `SendUserFile`, `ShareOnboardingGuide`), and turns auto-memory off. Model, theme, effort, and other keys stay machine-local. Sessions, credentials, and history under `~/.claude/` stay unmanaged.

Interactive `claude` / `c` sessions replace the default system prompt with `~/.claude/system-prompt-fable.md` when that file exists. The prompt is Amp Fable adapted for Claude Code tools. `claude update`, `claude mcp`, and other subcommands skip the flag.

Preview with `chezmoi cat ~/.claude/settings.json` and `chezmoi cat ~/.claude/system-prompt-fable.md`. Apply those targets when you want the live files updated.

## Profiles and skills

Profile behavior lives in [`.chezmoiignore`](.chezmoiignore). Skill membership lives in [`.chezmoidata.toml`](.chezmoidata.toml):

- `personal`: shared skills.
- `work`: shared and work skills, plus `akkio-helpers/`. Linear-aware Pi title metadata is shared by both profiles.

Pi subagent prompts are shared across profiles, but their model and reasoning settings are rendered per profile from `dot_pi/agent/agents/*.md.tmpl`. Personal uses the OpenCode Go selections; work keeps the original xAI and OpenAI Codex selections.

Pi uses `@tintinweb/pi-subagents` when delegation is useful or a loaded skill requests it. `Agent`, `get_subagent_result`, and `steer_subagent` stay available by default. `SubagentWorkflow` still requires explicit user opt-in to workflows or multi-agent orchestration. Its schema loads on subagent/workflow mentions or `/subagents`; schema visibility alone does not grant permission.

Herdr-based agent delegation requires an explicit user request to use Herdr for the current task. General subagent requests and skills cannot authorize it. This includes agent commands, pane commands, terminal input, and indirect shell launches. If pi-subagents is unavailable, Pi must work locally, not fall back to Herdr. Ordinary Herdr test and dev-server commands remain separate. These are prompt rules, not a shell execution guard. Apply the changed source targets, then run `/reload` in Pi to load the new rules.

Unclassified skill directories are not installed. Pi-specific files and development notes live under [`dot_pi/agent/`](dot_pi/agent/README.md).

### Shared coding workflow

[`pragmatic-code`](dot_agents/skills/pragmatic-code/SKILL.md) replaces `reviewing-python` and `reviewing-typescript-vue` in both profiles. In Pi, use `/skill:pragmatic-code plan ...`, `/skill:pragmatic-code implement ...`, or `/skill:pragmatic-code review ...`; `@pragmatic-code` also works. It stays user-invoked and loads Python, TypeScript, and Vue references only for the affected code. Shared-gate changes have a separate conditional audit. Other stacks use repository guidance and official documentation, with specialized coverage gaps stated explicitly.

Repository `AGENTS.md` files own work or personal project policy; the machine profile selects installation, not coding rules. This merge leaves Effect guidance, Go-specific guidance, and the separate `code-review` skill unchanged. A future apply retires the two old managed skill directories. Preview the new entry point with `chezmoi cat ~/.agents/skills/pragmatic-code/SKILL.md` before applying.

To change profiles, edit `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
profile = "work"
```

## Secrets

Private SSH keys stay on each machine. The repository manages only public SSH host routing; work SSH configuration and all key material remain local.

Shell tokens belong in untracked files under `~/.config/secrets/`; `dot_zshrc.tmpl` sources `kagi.env` and `executor.env` when present.

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
