---
name: general-purpose
description: General-purpose parent-twin subagent for normal multi-step coding tasks. Use when a task needs an autonomous subagent but no specialist persona fits.
tools: read, write, edit, bash, grep, find, ls
model: openai-codex/gpt-5.6-sol
thinking: medium
systemPromptMode: append
inheritProjectContext: true
inheritSkills: true
defaultContext: fork
---
