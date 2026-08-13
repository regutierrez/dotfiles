# Cursor agent steering and Pi extension patterns

_Researched 2026-08-13. Scope: public first-party Cursor documentation and announcements, this repository, and selected Pi packages on their default branches._

## Executive summary

Cursor exposes steering as several separate control planes rather than one master prompt:

1. **Prompt-time context** combines built-in instructions, tools, rules, skill descriptions, MCP catalogs, subagent definitions, conversation, and compacted summaries. Users can add explicit files, diffs, terminals, chats, and browser state with `@` mentions. [Cursor prompting docs](https://cursor.com/docs/agent/prompting)
2. **Persistent policy** comes from team, project, and user rules. Applicable rule text enters the start of model context. Project rules can be always-on, file-glob scoped, agent-selected by description, or manually attached. Nested `AGENTS.md` adds directory-specific instructions. [Cursor rules docs](https://cursor.com/docs/context/rules)
3. **On-demand procedure** comes from skills. Cursor initially gives the agent skill descriptions, then lets it load relevant `SKILL.md` content and related resources. This reduces always-on context. [Cursor skills docs](https://cursor.com/docs/context/skills), [Cursor 2.4 announcement](https://cursor.com/changelog/2-4)
4. **Delegation** uses isolated subagent contexts. The parent must provide needed context because a child does not inherit conversation history. Foreground children block; background children return immediately. Custom definitions control prompt, model, write access, and background mode. [Cursor subagent docs](https://cursor.com/docs/context/subagents)
5. **Runtime control** uses hooks before and after prompts, tools, subagents, compaction, and completion. Hook results can deny or rewrite tool inputs, inject context, modify prompts, or submit a follow-up message. [Cursor hooks docs](https://cursor.com/docs/agent/hooks)
6. **Continuation** uses conversation compaction, resumable chats and subagents, queued follow-ups, stop-hook follow-ups, and explicit modes. Cursor says older turns become a summary near the context limit. The CLI supports `--resume`, `-continue`, and local-to-cloud handoff. [Cursor prompting docs](https://cursor.com/docs/agent/prompting), [Cursor 2.4 announcement](https://cursor.com/changelog/2-4), [CLI announcement](https://cursor.com/changelog/cli-jan-16-2026)
7. **Task control** comes from Plan/Ask/Agent modes, approval and sandbox policy, user interruption, and hook gates. Plan Mode separates research and a reviewable plan from implementation. [Plan Mode docs](https://cursor.com/docs/agent/modes), [Cursor 1.7 announcement](https://cursor.com/changelog/1-7)

The local Pi setup already reproduces many of these mechanisms. Its strongest pieces are follow-up continuation, explicit loop state, custom compaction instructions, review-mode branching, and context inspection. The largest gap is one integrated policy layer for pre-tool gates and context injection. `pi-subagents` supplies the closest Cursor-like delegation and live child steering. `pi-autoresearch` supplies the strongest durable loop and compaction recovery. `pi-task` supplies deterministic phase orchestration.

## Cursor control planes

### Rules and prompt steering

Cursor calls rules “system-level instructions.” Applied rules enter the model context at its start. Rule activation supports `alwaysApply`, file `globs`, relevance from a `description`, and manual `@` attachment. Team rules take precedence over project rules, then user rules. Nested `AGENTS.md` files combine with parents, with more specific instructions taking precedence. [Cursor rules docs](https://cursor.com/docs/context/rules)

This is layered prompt composition, not model memory. Cursor states that models do not retain memory between completions. Rules provide reusable context at prompt time. [Cursor rules docs](https://cursor.com/docs/context/rules)

Skills are the dynamic counterpart. Cursor discovers skill descriptions at startup. The agent selects relevant skills and loads their files on demand. Skills can include scripts, references, assets, path scopes, and an explicit-only flag. [Cursor skills docs](https://cursor.com/docs/context/skills)

Explicit prompt context uses `@` references for files, folders, terminal output, old chats, git diffs, and browser state. Cursor recommends omitting explicit files when their identity is unknown because Agent can search. [Cursor prompting docs](https://cursor.com/docs/agent/prompting)

Cursor also has an access boundary. `.cursorignore` blocks direct Agent, Tab, Inline Edit, and `@` access. It does not stop terminal or MCP tools from reading those paths. Thus, it is not a complete tool sandbox. [Cursor ignore docs](https://cursor.com/docs/context/ignore-files)

### Context assembly and compaction

Cursor’s context explorer lists the major prompt components: system prompt, tool definitions, rules, skill descriptions, MCP data, subagent documentation, compacted conversation, and live conversation with tool results. Near the model limit, Cursor compresses older conversation into a summary. [Cursor prompting docs](https://cursor.com/docs/agent/prompting)

This public evidence explains the visible composition model. It does not reveal Cursor’s private base prompts, relevance rankers, exact compaction prompt, or token allocation algorithm. No authoritative public Cursor agent implementation was found in GitHub code search. Treat claims about those internals as unknown.

### Subagents and orchestration

Cursor subagents have separate context windows and return a final result to the parent. They can run in parallel. The parent supplies all necessary context because children start clean. Custom agents live in `.cursor/agents/` or compatible Claude/Codex locations. Frontmatter controls name, description, model, read-only mode, and background mode. [Cursor subagent docs](https://cursor.com/docs/context/subagents)

Cursor includes Explore, Bash, and Browser children. Their purpose is to isolate large search output, command logs, and browser snapshots. Agent can delegate automatically based on task scope and agent descriptions, or the user can invoke a named child. Background runs persist state and can be resumed by ID. [Cursor subagent docs](https://cursor.com/docs/context/subagents)

Cursor 2.4 introduced this model and described custom prompts, tools, and models. Cursor 2.5 added asynchronous and nested subagent improvements. [Cursor 2.4 announcement](https://cursor.com/changelog/2-4), [Cursor 2.5 announcement](https://cursor.com/changelog/2-5)

### Hooks and live steering

Cursor hooks are JSON-over-stdio processes. They run at lifecycle boundaries and can observe, block, or modify behavior. The public surface includes session, prompt, generic tool, shell, MCP, file, subagent, compaction, response, thought, and stop events. [Cursor hooks docs](https://cursor.com/docs/agent/hooks)

Important steering outputs include:

- `preToolUse`: allow or deny, give the agent a reason, or replace tool input.
- `postToolUse`: add context after a result; MCP output can be replaced.
- `beforeSubmitPrompt`: reject or rewrite the submitted prompt.
- `sessionStart`: inject `additional_context`.
- `subagentStart`: allow or deny a child.
- `subagentStop` and `stop`: return `followup_message` to continue automatically.
- `preCompact`: observe compaction state.

Hook failures are fail-open by default. `failClosed: true` changes this for security gates. Stop and subagent-stop follow-ups have loop limits. These controls make hooks a policy and continuation layer, not only telemetry. [Cursor hooks docs](https://cursor.com/docs/agent/hooks)

### Modes, queueing, and human control

Plan Mode researches, asks questions, writes a reviewable plan, then waits for the user to build it. Ask Mode is read-only exploration. Cursor can request a mode transition, and users can approve or reject transitions. [Plan Mode docs](https://cursor.com/docs/agent/modes), [Cursor 2.4 announcement](https://cursor.com/changelog/2-4)

Cursor 2.4 also reports improved queued-message handling and `-continue` for the last CLI chat. The CLI announcement adds `/resume` and local-to-cloud handoff. These are product-level continuation features; public sources do not expose their internal scheduler. [Cursor 2.4 announcement](https://cursor.com/changelog/2-4), [CLI announcement](https://cursor.com/changelog/cli-jan-16-2026)

## Existing Pi mechanisms in this repository

### Context visibility and instruction discovery

`dot_pi/agent/extensions/context.ts` implements a `/context` view. It discovers user and project extensions, indexes skills through registered commands, and walks ancestors from root to the current directory for `AGENTS.md` or `CLAUDE.md`. It takes at most one context file per directory. This resembles Cursor’s context explorer and nested instruction discovery, but it reports Pi’s state rather than changing selection policy. [`dot_pi/agent/extensions/context.ts:98-176`](../dot_pi/agent/extensions/context.ts)

### Mid-turn steering versus queued follow-up

Pi extensions use two distinct delivery modes:

- `deliverAs: "steer"` injects guidance into a live turn.
- `deliverAs: "followUp"` queues guidance for a later turn.

The local continuation extension queues a user message after `session_compact`. It tells the model to reconstruct intent from the active JSONL branch, reconcile it with the worktree, and immediately resume. [`dot_pi/agent/extensions/continue-after-compaction.ts:3-50`](../dot_pi/agent/extensions/continue-after-compaction.ts)

This is more explicit than Cursor’s documented default compaction. It protects user intent by following `parentId` links rather than trusting JSONL append order.

### Durable autonomous loop

`loop.ts` persists loop mode, stop condition, prompt, summary, and turn count as session entries. At `agent_end`, it sends a follow-up unless the loop ended. The model calls `signal_loop_success` to stop. Before compaction, the extension adds the active breakout condition to compaction instructions. On session start, it restores loop state. [`dot_pi/agent/extensions/loop.ts:211-232`](../dot_pi/agent/extensions/loop.ts), [`dot_pi/agent/extensions/loop.ts:322-453`](../dot_pi/agent/extensions/loop.ts)

This parallels Cursor stop-hook follow-ups, but it uses a model-visible completion tool and persisted state. It lacks an explicit hard iteration limit, unlike Cursor’s documented hook loop limits.

### Review mode as a task controller

`review.ts` builds a large review rubric, adds user and project review instructions, and starts a review turn with `sendUserMessage`. It stores review session state and can return to the origin branch. “Fix findings” is queued as a follow-up after the review summary. [`dot_pi/agent/extensions/review.ts:1140-1164`](../dot_pi/agent/extensions/review.ts), [`dot_pi/agent/extensions/review.ts:1560-1575`](../dot_pi/agent/extensions/review.ts)

This is a specialized mode implemented in an extension. Cursor has first-class Plan/Ask modes and a built-in review skill, but the common pattern is the same: add a focused instruction block, limit the current task, preserve state, then hand results into another turn.

## Public Pi packages with similar steering

### `nicobailon/pi-subagents`: closest match for Cursor subagents

The package gives the parent a `subagent` tool. Foreground children stream results. Background children stay active and expose status, transcript, steering, stop, resume, and fleet views. It also recommends a staged `clarify → scout → worker → fresh reviewers → worker` flow. [README at commit `60c8bae`](https://github.com/nicobailon/pi-subagents/blob/60c8baee44ee91746a3622a1bbdb0aa4a8ebc665/README.md#L39-L96)

Child runtime instructions enforce a parent/child authority boundary. A normal child cannot delegate. A fanout child can delegate only for its assigned fanout work. [child boundary source](https://github.com/nicobailon/pi-subagents/blob/60c8baee44ee91746a3622a1bbdb0aa4a8ebc665/src/runs/shared/subagent-prompt-runtime.ts#L37-L71)

Live control uses a filesystem inbox and acknowledgement channel. The runtime watches requests, maps live guidance to `steer`, maps busy or explicit future guidance to `followUp`, limits the queue, and acknowledges delivery. It also sends soft tool-budget warnings as steer messages and blocks calls at the hard limit. [steering runtime](https://github.com/nicobailon/pi-subagents/blob/60c8baee44ee91746a3622a1bbdb0aa4a8ebc665/src/runs/shared/subagent-prompt-runtime.ts#L276-L329), [delivery and acknowledgements](https://github.com/nicobailon/pi-subagents/blob/60c8baee44ee91746a3622a1bbdb0aa4a8ebc665/src/runs/shared/subagent-prompt-runtime.ts#L343-L430)

This is the best existing base for Cursor-like isolated agents, asynchronous work, live steering, resource budgets, and resumable control.

### `davebcn87/pi-autoresearch`: strongest loop and continuation design

Autoresearch persists objective and history in `.auto/prompt.md` and `.auto/log.jsonl`. It loops through edit, benchmark, log, keep/revert, and repeat. The files survive restarts and context resets. [README at commit `00062fb`](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/README.md#L90-L104), [loop design](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/README.md#L138-L147)

The extension replaces compaction output with a summary built from durable state, then schedules a continuation after compaction or an experiment turn. It injects a short mode block before every agent start. [`index.ts` continuation](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/extensions/pi-autoresearch/index.ts#L1174-L1227), [`index.ts` lifecycle hooks](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/extensions/pi-autoresearch/index.ts#L1500-L1538)

Optional before/after scripts receive JSON. Their stdout becomes a live steer message. Errors and timeouts also become steering feedback. This closely matches a narrow form of Cursor command hooks. [hook contract](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/README.md#L268-L281), [steer injection](https://github.com/davebcn87/pi-autoresearch/blob/00062fb9cc425e71d82e75445dc5b6ad31c32f0e/extensions/pi-autoresearch/index.ts#L2449-L2477)

### `mjasnikovs/pi-task`: deterministic orchestration

`pi-task` drives requests through fixed refine, research, grill, compose, and critique phases. It persists each boundary to Markdown. Research fans out to isolated children, while the parent receives distilled output. [README at commit `e6173e7`](https://github.com/mjasnikovs/pi-task/blob/e6173e7e7cd64f073cf9e5018c9c2f06ad938c4b/README.md#L19-L30), [pipeline](https://github.com/mjasnikovs/pi-task/blob/e6173e7e7cd64f073cf9e5018c9c2f06ad938c4b/README.md#L86-L94)

It also registers worker tools for isolated code search, web search, focused fetch extraction, and installed-package documentation. This is closer to a coded workflow engine than Cursor’s model-led delegation. [worker tools](https://github.com/mjasnikovs/pi-task/blob/e6173e7e7cd64f073cf9e5018c9c2f06ad938c4b/README.md#L171-L198)

The main benefit is predictable phase order and crash recovery. The trade-off is less model autonomy and more workflow-specific code.

## Comparison and design implications

| Capability | Cursor | Local Pi / packages |
|---|---|---|
| Persistent rules | Team/project/user rules; nested `AGENTS.md` | Pi project context; local `/context` reports discovered files |
| Dynamic procedures | Skills selected by description and scope | Pi skills; local `/context` indexes them |
| Explicit context | `@` files, diffs, chats, terminal, browser | Prompt attachments and tool reads; no one local unified picker inspected |
| Context introspection | Token breakdown by component | Local `/context` approximates loaded files, skills, extensions, and usage |
| Mid-turn steering | User queue and hooks | `deliverAs: "steer"`; used by autoresearch and pi-subagents |
| Future-turn continuation | Queue, stop-hook follow-up, resume | `followUp`; local compaction continuation and loop extension |
| Subagents | Built-in and custom; foreground/background; resumable | `pi-subagents` is close and adds fleet control and budgets |
| Hooks | Broad prompt/tool/subagent/compaction lifecycle | Pi extension events; autoresearch has scoped shell hooks |
| Modes | Plan, Ask, Agent; transition approval | Review extension and workflow packages implement specialized modes |
| Deterministic workflow | Plan artifacts plus model orchestration | `pi-task` fixed persisted phase machine |

A Cursor-like Pi design should not start with another large base prompt. The evidence supports five small primitives:

1. Keep static policy in context files or always-on rules.
2. Keep procedures in discoverable skills and load full text only when relevant.
3. Use `steer` only for current-turn correction. Use `followUp` for ordered next work.
4. Persist loop, child, and workflow state outside transient context. Include critical state in compaction summaries.
5. Put hard controls in code: tool gates, spawn limits, iteration limits, permissions, cancellation, and acknowledgements.

The current repository already has primitives 1, 3, and 4. Adopting `pi-subagents` patterns would cover delegation and live control. A general hook policy layer would close most of the remaining gap.

## Evidence limits

- Cursor is proprietary. This report uses public behavior contracts, not private prompt or scheduler code.
- Cursor documentation is live and can change without stable versioned permalinks. Changelog pages provide dated first-party snapshots.
- Public GitHub search found no authoritative Cursor agent implementation. Search results were used only for discovery, not implementation claims.
- Pi package findings describe the listed default-branch commits, not every npm release.
- Local file citations describe the current worktree. They are intentionally path citations because this task asked for repository-local extension inspection.
