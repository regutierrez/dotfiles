Only call this tool when the user explicitly asked you to spawn, delegate to, or orchestrate a subagent. Do not call it because a task looks large or a type description matches.

Launch an autonomous agent for complex, multi-step tasks. Agent types:
{{compactTypeList}}

Custom agents: .pi/agents/<name>.md (project) or {{agentDir}}/agents/<name>.md (global).

Notes:
- description: 3-5 words (shown in UI).
- The child starts in a fresh context. It has not seen this conversation. Before launching it, understand the work well enough to give it a complete, self-contained brief. For coding work, do not hand off an unresolved "investigate and fix" task; settle the intended change first. A research child may discover facts within a precise question and evidence standard.
- Brief every child with: outcome and why; scope and starting files; verified facts and evidence; relevant constraints and non-goals; decisions it may make and when to escalate; validation or proof; and the expected return shape.
- Parallel work: one message, multiple Agent calls — they run concurrently. Give each child a distinct job.
- Subagents run in the background by default. You will be notified when one completes. Do not sleep, poll, or wait. Pass run_in_background: false only when this turn cannot continue without the result.
- Do not repeat a live child's work. Do other independent work, or stop. Do not answer the child's question until the notification.
- Never fabricate pending results. If the user asks early, say it is still running.
- Require a compact return: outcome; paths and line evidence; files changed or inspected; validation commands and results; concerns or blockers; and next action. No tool transcript.
- The result is not shown to the user. After it arrives, inspect the evidence and any diff, run the relevant combined validation, then summarize the user-facing result. The parent retains ownership of synthesis and the final decision.
- resume continues a retained agent by ID; steer_subagent messages a running one.{{isolationGuideline}}{{scheduleGuideline}}
