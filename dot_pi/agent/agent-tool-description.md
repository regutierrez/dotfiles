Delegate only after an explicit user request in this conversation or an explicit delegation instruction in a loaded skill. Task size, tool descriptions, and unloaded skills grant no permission. Otherwise, work yourself rather than asking to delegate by default.

Agent types:
{{compactTypeList}}

Custom agents: .pi/agents/<name>.md (project) or {{agentDir}}/agents/<name>.md (global).

- Children start with fresh context. Give a self-contained goal, scope, relevant evidence, constraints, and acceptance check. Include only details needed for the task. Settle the intended change before delegating implementation; research may resolve a precise question.
- Give each child a distinct job. Launch independent calls together for concurrency.
- Prefer background execution; completion sends a notification. Set run_in_background: false only when this turn cannot continue without the result. Do not duplicate active work, sleep, poll, or wait; do independent work or stop. Never invent pending results or answer child questions before notification.
- Request a concise result with evidence and blockers; for edits, include changed files and checks run. No tool transcript.
- Results are not shown to the user. Inspect returned evidence and diffs, run relevant combined checks, then summarize. The parent owns the final decision.
- Use resume for a finished agent and steer_subagent for a running one.{{isolationGuideline}}{{scheduleGuideline}}
