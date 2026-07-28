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

## Creating a worktree

1. Propose a branch name (repo-specific rules may apply — see below).
2. Confirm with the user before `wt switch --create`.
3. Create: `wt switch --create <branch> -C <repo> [--base <base>]`.
4. Resolve the worktree path from `wt switch --format json` or `git -C <repo> worktree list`.
5. Run any repo-specific bootstrap in the new worktree (see below).

Stop on first failure; capture stderr/stdout. Report branch, path, and which bootstrap steps completed.

## Akkio (`~/Akkio`)

**Only when creating a worktree for the Akkio repo:** read and follow [akkio-create-worktree.md](akkio-create-worktree.md) in full. It adds branch naming, stack-profile selection (`ui-only` / `web-only` / `full-web-ml`), bootstrap (`worktree:setup`, `wt-stack`, VPN), and agent overrides — not the generic `wt` steps above.

Do not load that file for switch/list/remove/merge/prune on Akkio or for worktrees in other repos.
