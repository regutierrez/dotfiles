---
name: manage-worktree
description: Use whenever creating, switching, listing, removing, merging, or cleaning up git worktrees. DO NOT USE if request just needs creating branches. Always go through Worktrunk (`wt`), not raw `git worktree`.
disable-model-invocation: true
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

## Akkio repo — create workflow

When creating a worktree for `~/Akkio`, follow this sequence. Do not skip confirmation or setup.

### 1. Propose branch name

Branch must be `pael-akkio/<slug>`:

- If the user already gave a good branch slug, use it after the prefix.
- Otherwise derive a slug from the issue/task: **6–8 hyphenated words** that best describe the work (lowercase, no spaces).
- Examples: `pael-akkio/fix-chart-access-gate`, `pael-akkio/agent-finegrained-observability-hooks`.

### 2. Confirm with user

Before running `wt switch --create`, show the proposed branch name and the short description it encodes. Ask whether the description is good enough to use as the branch slug. Revise until the user approves or supplies their own slug.

### 3. Create worktree

From the Akkio repo:

```sh
wt switch --create <branch> -C ~/Akkio [--base <base>]
```

Use `--base` when the task needs a specific release branch (e.g. `release/horizon-staging`, `release/horizon-production`). Resolve the new worktree path from `wt switch --format json` or `git -C ~/Akkio worktree list`.

### 4. Bootstrap the worktree

In the new worktree directory, run in order:

```sh
cd <worktree_path>
mise trust
mise install
npm install
"$HOME/repos/akkio-agent-overrides/bin/akkio-bootstrap" <worktree_path>
"$HOME/.local/bin/akkio-overrides-visibility" hide <worktree_path>
```

`akkio-bootstrap` wires `~/.local/bin/akkio-*` if needed, installs override hooks into the worktree, and applies overrides once. `hide` sets `skip-worktree` on tracked override files for this worktree only.

Stop on first failure; capture stderr/stdout.

### 5. Report

When all steps succeed, report:

- branch name
- worktree path
- that `mise trust`, `mise install`, `npm install`, and agent overrides completed

On failure, report which step failed and the exact error output. Do not claim success for steps that did not finish.
