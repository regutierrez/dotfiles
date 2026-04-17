# Pi agent extensions

Vendored from:
- https://github.com/mitsuhiko/agent-stuff/tree/929d59696696210b403d2fbf9a82259b0078794d/pi-extensions

## Install note

These extensions live under `~/.pi/agent/` when applied via chezmoi.

Included extensions now also contain `answer.ts`, which adds `/answer` and `ctrl+.` for extracting questions from the last assistant reply into an interactive Q&A TUI.

`multi-edit.ts` depends on the npm package `diff`, so after syncing dotfiles you must install dependencies in:

```bash
cd ~/.pi/agent
bun install
```

Then reload pi:

```text
/reload
```
