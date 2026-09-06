---
name: terminal-browser
description: Open a real Chromium browser inside a Herdr pane and drive it with terminal-browser action (snapshot, click, fill, eval). Use when the user should see a page next to the agent. For headless CDP without a pane, use web-browser.
disable-model-invocation: true
---

# Terminal Browser

`terminal-browser` draws Chromium in the terminal with the Kitty graphics protocol. Inside Herdr it detects `HERDR_PANE_ID` and can split a pane.

Do not `herdr pane split` and then launch the browser. `terminal-browser open --split` already splits through Herdr.

Keep `web-browser` for headless Chrome DevTools work.

## Open a page

```bash
terminal-browser open <url> --split right
terminal-browser open ./plan.html --split right
```

Without `--split` the browser takes over the current pane. Prefer `--split right` so the agent pane stays.

From Herdr, the same split is:

```bash
herdr plugin action invoke open-split --plugin zenbu-labs.terminal-browser
```

Human shortcut: prefix+b.

## Drive the page

```bash
terminal-browser ls
terminal-browser action -- snapshot
terminal-browser action -- click @e14
terminal-browser action -- fill @e3 "text"
terminal-browser action -- eval "document.title"
terminal-browser action done
```

`action` is agent-browser compatible. After the last action, run `terminal-browser action done` so the in-page agent indicator clears.

Do not `herdr pane read` that pane. The page is graphics, not scrollback text.

For the full CLI, run `terminal-browser help` and `terminal-browser <command> --help`.

## Remote

Prefer `terminal-browser --ssh <user@host> <url>` so Chromium stays local and only HTTP is proxied.
