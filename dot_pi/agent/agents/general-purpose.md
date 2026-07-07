---
display_name: Agent
description: General-purpose parent-twin subagent for normal multi-step coding tasks. Use when a task needs an autonomous subagent but no specialist persona fits.
tools: read, write, edit, bash, grep, find, ls
extensions: true
skills: true
model: cursor/composer-latest:fast
prompt_mode: append
persist_session: true
---
