# Pi agent extensions

Extensions and Pi-specific helpers applied to `~/.pi/agent/` via chezmoi.

Vendored from:

- https://github.com/mitsuhiko/agent-stuff/tree/929d59696696210b403d2fbf9a82259b0078794d/pi-extensions

## Included

- `extensions/answer.ts`: adds `/answer` and `ctrl+.` for extracting questions from the last assistant reply into an interactive Q&A TUI.
- `extensions/todos/`: file-backed `todo` tool and `/todos` manager. Todo data lives in `~/.pi/agent/todos/<cwd-key>/` by default, or `$PI_TODO_PATH` when set.
- `skills/update-pi`: Pi-specific update helper.
- `intercepted-commands/`: wrappers that nudge Python package installs toward `uv`.

## Dependencies

`package.json` is the source of truth. `node_modules/`, lockfiles, and todo data are intentionally ignored by chezmoi so machine-local installs do not churn this repo.

After syncing dotfiles, install deps on the target machine:

```bash
cd ~/.pi/agent
npm install
```

Then reload Pi:

```text
/reload
```
