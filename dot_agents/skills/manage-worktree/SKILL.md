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
