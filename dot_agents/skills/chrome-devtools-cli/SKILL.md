---
name: chrome-devtools-cli
description: Use this skill to write shell scripts or run shell commands to automate tasks in the browser or otherwise use Chrome DevTools via CLI.
---

The `chrome-devtools-mcp` CLI lets you interact with Chrome from the terminal.

## Required browser behavior

Keep one long-lived browser session. The visible browser is only for the user's initial login; normal automation must run in background tabs without bringing Chrome forward.

1. Check the daemon before doing anything else:
   - Run `chrome-devtools status`.
   - If it is running, reuse it. **Do not call `start` or restart it.**
   - Starting the daemon again restarts Chrome and steals focus.

2. Spawn visible Chrome only when no daemon is running:
   - Run `chrome-devtools start --headless=false` once so the user can log in.
   - Do not repeat this command during the task or between tasks while the daemon remains available.
   - Do not switch this logged-in session to headless mode; that would require restarting it. “Background” here means background tabs in the existing visible browser.

3. Run all automation in a new background tab:
   - Use `chrome-devtools new_page "<url>" --background true`.
   - Use `about:blank` if no URL is provided.
   - Use only that tab for the task.

4. Never steal focus:
   - Never use `select_page --bringToFront true` unless the user explicitly requests it.
   - When changing the CLI's active page, use `select_page <pageId>` without `--bringToFront`.
   - Do not restart Chrome merely to begin a new task.

## AI workflow

1. Run `chrome-devtools status`.
2. Only if it is not running, run `chrome-devtools start --headless=false` and allow the user to log in if needed.
3. Create a task tab with `chrome-devtools new_page "<url-or-about:blank>" --background true`.
4. Inspect with `take_snapshot` to get element `<uid>` values.
5. Act with `click`, `fill`, `press_key`, `type_text`, `evaluate_script`, etc.
6. Keep every task operation in the background; reuse the daemon for later tasks.

Snapshot example:

```text
uid=1_0 RootWebArea "Example Domain" url="https://example.com/"
  uid=1_1 heading "Example Domain" level="1"
```

## Common commands

```bash
chrome-devtools status
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
chrome-devtools status                   # Always check first
chrome-devtools start --headless=false   # Only when no daemon exists; visible for initial login
chrome-devtools stop                     # Only when the user asks to end the browser session
```
