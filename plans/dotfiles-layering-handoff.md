# Handoff: dotfiles layering strategy

Date: 2026-06-10

## Context

The user has multiple dotfiles repositories and wants a pragmatic way to use `regutierrez/arch-dotfiles` as a base while applying work-specific edits from this chezmoi-managed repo.

Repos discussed:

- Current repo: `/Users/pakkio/.local/share/chezmoi`
  - Remote `origin`: `git@github.com:pael-akkio/dotfiles.git`
  - Remote `upstream`: `https://github.com/regutierrez/dotfiles.git`
  - Uses chezmoi with profiles: `personal`, `work`, `server`
- Fork/reference repo: `https://github.com/regutierrez/dotfiles`
  - Cached at `/Users/pakkio/.cache/checkouts/github.com/regutierrez/dotfiles`
- Desired base repo: `https://github.com/regutierrez/arch-dotfiles`
  - Cached at `/Users/pakkio/.cache/checkouts/github.com/regutierrez/arch-dotfiles`
  - Layout is plain `$HOME` under `home/`
  - Installs via Makefile symlinks: `make install`, preview with `make check`

## Current repo observations

This repo is already a mature chezmoi source-state repo:

- `.chezmoidata.toml` defines profile flags like `manage_dot_config`, `manage_agents`, `manage_nvim`, `use_age`, `tmux_plugins`.
- `.chezmoiignore` conditionally excludes files by profile/OS.
- `.chezmoiexternal.toml` pulls nvim config from `https://github.com/regutierrez/rawdog-nvim-conf.git`.
- `.chezmoi.toml.tmpl` sets profile from `CHEZMOI_PROFILE` and disables age encryption for `work`.

`arch-dotfiles` currently manages a much smaller plain tree:

- `.zshrc`
- `.gitconfig`
- `.config/lazygit/config.yml`
- `.config/kitty/*`
- `.config/niri/*`
- `.agents/skills/*`

There are target-path overlaps between this repo and `arch-dotfiles`, especially:

- `~/.zshrc`
- `~/.config/lazygit/config.yml`
- several `~/.agents/skills/*`

Avoid having two independent tools own the same target path unless using an intentional Git patch/rebase workflow.

## Options already discussed

### Option 1: Keep chezmoi top-level, import base

Use this repo as the single source of truth. Pull common/base pieces from `arch-dotfiles` into chezmoi source format, then use profiles/snippets/templates for work-specific differences.

Good for profiles, secrets, mac/work/server differences, and one `chezmoi apply`.

### Option 2: Apply base first, then overlay work with chezmoi

Install `arch-dotfiles` first, then apply this repo:

```sh
make -C vendor/arch-dotfiles install
CHEZMOI_PROFILE=work chezmoi apply
```

Requires conflict discipline: exclude or refactor shared target paths. Recommended as the short-term bridge.

### Option 3: Git patch stack / work branch on top of base

Make work changes commits on top of the `arch-dotfiles` base and rebase when base changes.

Best if work frequently edits the same exact files as base. This is the cleanest model for “base + edits”.

### Option 4: GNU Stow / rcm with two home-layout repos

Use symlink packages and design base files to source work snippets. Simple, but lacks chezmoi’s templates/secrets/profiles.

### Option 5: Dotter

A cleaner package/profile-oriented dotfile manager alternative. Still needs one owner per path or snippet composition.

### Option 6: Nix Home Manager

Powerful for packages + services + dotfiles, but likely too heavy unless the goal expands beyond dotfiles.

## Branch-per-machine discussion

User asked about using different branches per machine type in a single repo while still managed by chezmoi.

Recommendation given:

- Avoid branch-per-machine.
- Branch-per-environment/profile can work if disciplined.
- Better default: one `main` repo with chezmoi profiles.
- If same-file base edits are common, use a Git-native patch stack: `work` branch rebased on top of `base/main`.

Main risks of branch-per-machine:

- shared fixes must be merged/cherry-picked everywhere
- branches drift into separate repos
- two axes of configuration appear: Git branch + chezmoi profile
- poor fit for per-host tweaks

Reasonable branch model if chosen:

```text
base/main   # arch/base dotfiles
work        # work commits on top of base
personal    # optional personal commits on top of base
```

Workflow:

```sh
git switch work
git fetch origin
git rebase origin/main
chezmoi apply -n -v
chezmoi apply
```

## Recommended next implementation path

Pragmatic short-term path:

1. Keep this chezmoi repo as the work overlay.
2. Vendor or clone `arch-dotfiles` under a stable path.
3. Add a wrapper script/Make target that runs base install first, then `CHEZMOI_PROFILE=work chezmoi apply`.
4. Identify overlapping target paths and choose one owner for each.
5. Refactor unavoidable overlaps into snippet includes.

Likely refactors:

- Base `~/.zshrc` should source files from `~/.config/zsh/*.zsh` or similar.
- Work repo should own `~/.config/zsh/work.zsh`, not necessarily the entire `~/.zshrc`.
- Git config should use `[include]` or `[includeIf]` for work-specific identity/settings.
- YAML configs should either have one owner or be generated from templates; avoid two managers writing the same YAML file.

If overlaps become painful, switch to Option 3: make work a branch/patch stack over `arch-dotfiles`.

## Suggested skills for next agent

- `chezmoi`: required for source-state naming, profile logic, `.chezmoiignore`, and safe `chezmoi diff/apply -n` validation.
- `librarian`: use if refreshing or inspecting `regutierrez/arch-dotfiles` or `regutierrez/dotfiles` again.
- `manage-worktree`: use if experimenting with a branch/patch-stack implementation in a separate worktree.
- `commit`: use only when the user asks to commit the resulting plan or implementation.

## Important caution

The current worktree had pre-existing uncommitted changes before this handoff was created. Do not assume all dirty files are from this session. Check `git status --short` before editing or committing.
