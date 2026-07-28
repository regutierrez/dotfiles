---
name: manage-worktree
description: Use whenever creating, switching, listing, removing, merging, or cleaning up git worktrees. DO NOT USE if request just needs creating branches. Always go through Worktrunk (`wt`), not raw `git worktree`.
disable-model-invocation: false
---

Use Worktrunk for all worktree operations. Run from inside the repo, or pass `-C "$HOME/<parent>/<repo>"`.

- `wt switch --create <name>` — new worktree at `~/.wt/<parent>/<repo>/<name>`.
- `wt switch <name>` — switch (omit `<name>` for picker; shortcuts: `^` default, `-` previous, `pr:N` GitHub PR).
- `wt list` — show worktrees (`--full` adds CI / diffstat / summaries).
- `wt remove [branch]` — remove worktree; deletes branch if merged. Defaults to current.
- `wt step prune --dry-run` — preview bulk-removal of merged worktrees (drop `--dry-run` to apply).
- `wt merge` — squash + rebase + ff into default + remove worktree.
- Use `$HOME`/`~`; never hard-coded `/Users/...` paths.
- Don't use `git worktree` directly — go through `wt`.

## Agents and non-interactive shells

`wt switch` changes directory only when the **zsh `wt()` shell function** is active (from `eval "$(command wt config shell init zsh)"` in `.zshrc`). Agent harnesses (Cursor, Pi, CI) usually run the **`wt` binary** in non-interactive subprocesses — shell integration is installed but **not active** there. Worktrunk then prints something like *"cannot change directory — shell integration installed but not active"* and **does not** change the process cwd.

Do not treat `wt switch` as setting the agent's working directory. After every switch or create:

1. Resolve the path (prefer JSON):

```sh
wt switch <branch> -C <repo> --format json
# → {"path":"/Users/.../.wt/.../..."}
```

2. Run bootstrap and repo commands with an explicit directory — `cd <path> && …`, `-C <path>`, or the tool's `working_directory` — on **every** invocation. A later command in a new subprocess will not inherit a prior `wt switch` cd.

Interactive terminals with shell integration behave differently; agent instructions still use explicit paths.

## Creating a worktree

1. Propose a branch name (repo-specific rules may apply — see below).
2. Confirm with the user before `wt switch --create`.
3. Create and capture path in one step:

```sh
wt switch --create <branch> -C <repo> [--base <base>] --format json
```

4. `cd` to `.path` from that JSON (or parse `git -C <repo> worktree list`) before any bootstrap.
5. Run repo-specific bootstrap with explicit `cd` / `-C` on every command (see below).

Stop on first failure; capture stderr/stdout. Report branch, path, and which bootstrap steps completed.

## Akkio (`~/Akkio`)

**Only when creating a worktree for the Akkio repo:** read and follow [akkio-create-worktree.md](akkio-create-worktree.md) in full. It adds branch naming, stack-profile selection (`ui-only` / `web-only` / `full-web-ml`), bootstrap (`worktree:setup`, `wt-stack`, VPN), and agent overrides — not the generic `wt` steps above.

Do not load that file for switch/list/remove/merge/prune on Akkio or for worktrees in other repos.
