---
name: chrome-devtools-cli
description: Use this skill to write shell scripts or run shell commands to automate tasks in the browser or otherwise use Chrome DevTools via CLI.
---

The `chrome-devtools-mcp` CLI lets you interact with Chrome from the terminal.

## Required browser behavior

For every browser task:

1. Use visible Chrome, not headless:
   - ALWAYS Start/restart with `chrome-devtools start --headless=false`. 
   - Only remove `--headless=false` if user explicitly asks to run in headless.

2. Work in a new background tab:
   - Start with `chrome-devtools new_page "<url>" --background true`.
   - Use `about:blank` if no URL is provided.
   - Use only that tab for the task.

3. Do not steal focus:
   - Do not use `select_page --bringToFront true` unless explicitly requested. This makes Chrome pop up in foreground during tasks.

## AI Workflow

1. Start/restart daemon only if needed: `chrome-devtools start --headless=false`.
2. Create a new background tab: `chrome-devtools new_page "<url-or-about:blank>" --background true`.
3. Inspect with `take_snapshot` to get element `<uid>` values.
4. Act with `click`, `fill`, `press_key`, `type_text`, `evaluate_script`, etc.

Snapshot example:

```text
uid=1_0 RootWebArea "Example Domain" url="https://example.com/"
  uid=1_1 heading "Example Domain" level="1"
```

## Common commands

```bash
chrome-devtools list_pages
chrome-devtools new_page "https://example.com" --background true
chrome-devtools select_page 1
chrome-devtools take_snapshot
chrome-devtools click "uid"
chrome-devtools fill "uid" "text"
chrome-devtools press_key "Enter"
chrome-devtools type_text "hello"
chrome-devtools evaluate_script "() => document.title"
chrome-devtools take_screenshot --filePath "shot.png"
chrome-devtools list_console_messages
chrome-devtools list_network_requests
```

Use `chrome-devtools <command> --help` for full options. Output defaults to Markdown; use `--output-format=json` for JSON.

## Service management

```bash
chrome-devtools start --headless=false   # Start/restart with visible Chrome
chrome-devtools status                   # Check daemon status
chrome-devtools stop                     # Stop daemon
```
