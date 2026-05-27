# Inline Pi Invocation Plan

Implement inline invocation markers so a message can request skills or extension commands from the middle of natural language, instead of requiring slash commands at the start of the input.

## Goal

Support prompts like:

```text
Refactor this file [[skill:tdd]] and then [[cmd:review]] focus on edge cases.
```

and transform them into a Pi-native prompt that reliably loads the requested skill instructions or delegates to registered extension behavior.

## Current Pi Behavior

Pi processes user input in this order:

1. Extension commands are checked first (`/command ...`). If matched, the command handler runs and the `input` event is skipped.
2. `input` event fires with raw text.
3. Skill commands (`/skill:name ...`) and prompt templates expand if not handled.
4. Agent turn starts.

Implication:

- `/skill:name` works as a command-style invocation, normally at the start of input.
- Inline text like `do X then /skill:commit Y` is treated as normal prose.
- An extension can implement inline syntax by handling the `input` event before built-in skill/template expansion.

## Proposed UX

Use explicit bracket directives to avoid ambiguity with prose:

```text
[[skill:commit]] commit only the staged changes
[[skill:tdd args="integration tests"]] add coverage for this bug
[[cmd:handoff]] compact this into a handoff
[[template:review]] focus on security and correctness
```

Recommended initial scope:

- `[[skill:<name>]]`
- `[[skill:<name> <args>]]`
- Optional later: `[[cmd:<name> <args>]]`
- Optional later: `[[template:<name> <args>]]`

Do **not** overload raw `/skill:name` in the middle of prose initially. It is harder to parse safely and may surprise users when writing documentation or examples.

## Extension Location

Add a Pi extension in the chezmoi source tree:

```text
dot_pi/agent/extensions/inline-invocation.ts
```

Target path after chezmoi apply:

```text
~/.pi/agent/extensions/inline-invocation.ts
```

## Implementation Strategy

### 1. Register an `input` handler

The extension subscribes to Pi's `input` event:

```ts
pi.on("input", async (event, ctx) => {
  if (event.source === "extension") return { action: "continue" };
  // parse and transform inline directives
});
```

Avoid processing extension-injected messages to prevent loops.

### 2. Parse inline directives

Start with a conservative parser:

```text
[[skill:name]]
[[skill:name args...]]
```

Rules:

- Directive must start with `[[` and end with `]]`.
- Kind is one of `skill`, later `cmd`, `template`.
- Name matches Pi skill/command-safe naming: lowercase letters, digits, hyphens, optional colon suffix for command variants if needed.
- Everything after the first whitespace is directive args.
- Leave unknown or malformed markers untouched and optionally notify.

### 3. Resolve available commands

Use `pi.getCommands()` to validate directives.

For skills:

- Match command name `skill:<name>` with `source === "skill"`.
- Use `sourceInfo.path` as the SKILL.md path.

For extension commands, later:

- Match command name `<name>` with `source === "extension"`.
- Extension commands execute immediately only when the entire input is a command. Inline command semantics need extra care, so postpone unless there is a clear use case.

### 4. Transform skill directives into explicit loaded context

Instead of trying to emit `/skill:name` from the middle of a prompt, read the skill file and inline it into the prompt as instruction context.

Example transformed prompt:

```text
The user requested these Pi skills inline. Follow them for this turn.

<inline_skill name="commit" args="commit only the staged changes" path=".../SKILL.md">
...SKILL.md content...

User: commit only the staged changes
</inline_skill>

Original user request with directives removed:

commit only the staged changes
```

Why this approach:

- It works regardless of Pi's command-start expansion rules.
- It preserves the user's natural-language prompt order.
- It mirrors the `/skill:name args` behavior: skill content plus `User: <args>`.

### 5. Preserve user text

Replace each directive with either:

- nothing, if directive args describe the skill-specific task; or
- the directive args, if they should remain in the natural prompt.

Initial recommendation: replace `[[skill:name args...]]` with `args...` in the original prompt, and also append `User: args...` inside the skill block.

Example:

```text
Please [[skill:commit commit only macOS gh change]]
```

becomes:

```text
<inline_skill name="commit">
...skill content...
User: commit only macOS gh change
</inline_skill>

Original user request with inline directives expanded:
Please commit only macOS gh change
```

### 6. Handle multiple skills

Allow multiple skill directives in one prompt.

Ordering:

1. Preserve first occurrence order.
2. Deduplicate identical skill+args pairs.
3. If the same skill appears with different args, include both `User:` lines under one skill block or include separate blocks. Prefer one block with multiple invocations.

### 7. Guardrails

- If no directive is found: `continue` unchanged.
- If a skill is missing: notify and leave the directive as text, or transform into a clear warning in the prompt. Prefer notify + leave unchanged.
- Limit loaded skill content size to avoid accidental huge prompt injection. Default max: 50 KB per skill.
- Do not execute commands from directive args.
- Do not read arbitrary paths from user input; resolve only via `pi.getCommands()`.

## Deferred: Inline Extension Commands

Inline extension commands are not equivalent to skills:

- Slash extension commands are handled before `input`, so they bypass the agent turn.
- Inline command execution in the middle of a prompt could require splitting one user message into multiple operations.

Possible later designs:

1. **Transform-only commands**: extension command registers a pure text expander.
2. **Follow-up commands**: input handler extracts `[[cmd:name args]]`, removes it from the prompt, and queues `/name args` as a follow-up via `pi.sendUserMessage()`.
3. **Tool-backed commands**: expose extension behavior as tools and let the model call them after inline context tells it to.

Recommendation: implement skills first. Revisit commands after using the syntax for real tasks.

## Testing Plan

Create tests for the parser as pure functions:

- no directive -> unchanged
- one skill directive with no args
- one skill directive with args
- multiple skills preserve order
- malformed markers remain unchanged
- unknown skill reports warning/no transform
- duplicate skill directive dedupes as expected

Manual Pi tests:

```text
[[skill:commit]] commit this specific change
Please use [[skill:tdd]] to add a regression test first.
Do this normally with no directives.
```

## Implementation Order

1. Add `dot_pi/agent/extensions/inline-invocation.ts`.
2. Implement parser helpers in the same file.
3. Add `input` event handler for `skill` directives only.
4. Resolve skills through `pi.getCommands()`.
5. Read SKILL.md content using `node:fs/promises`.
6. Return `{ action: "transform", text: expandedPrompt }`.
7. Add user notifications for missing or malformed directives.
8. Run `/reload` in Pi and test interactively.
9. If useful, add command/template support in a second pass.

## Open Questions

- Should the directive args be removed from the visible natural-language request, retained, or both retained and passed as `User:`? Initial recommendation: both retained and passed as `User:`.
- Should inline directives support quoted args and escaping, or keep the format simple?
- Should missing skills fail closed by blocking the agent turn, or fail open by leaving the marker as text?
- Should this be global (`~/.pi/agent/extensions`) or project-local only? Current recommendation: global via chezmoi, since it changes general Pi UX.
