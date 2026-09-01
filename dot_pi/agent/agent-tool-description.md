Launch an autonomous agent for complex, multi-step tasks. Agent types:
{{compactTypeList}}

Custom agents: .pi/agents/<name>.md (project) or {{agentDir}}/agents/<name>.md (global).

Notes:
- description: 3-5 words (shown in UI). Prompts must be self-contained — the agent has not seen this conversation.
- Parallel work: one message, multiple Agent calls — they run concurrently. Give each child a distinct job.
- Subagents run in the background by default. You will be notified when one completes. Do not sleep, poll, or wait. Pass run_in_background: false only when this turn cannot continue without the result.
- Do not repeat a live child's work. Do other independent work, or stop. Do not answer the child's question until the notification.
- Never fabricate pending results. If the user asks early, say it is still running.
- The result is not shown to the user — summarize it after it arrives. Verify claimed code changes before reporting work done.
- resume continues a previous agent by ID; steer_subagent messages a running one.{{isolationGuideline}}{{scheduleGuideline}}
