---
name: commit
description: Draft and create a conventional commit from the current changes. Use when the user asks to commit work, wants a commit message, or wants git changes summarized into a commit.
disable-model-invocation: false
---

# Commit

Create one git commit for the user's current work. ONLY RUN ONCE IN THE SESSION UNLESS INVOKED AGAIN.

## Core rules

- Read the current git state before drafting anything: `git status --short`, `git diff --cached`, `git diff`, and recent `git log` for local style.
- Use the current conversation and any command arguments as intent. Prefer the why over a file-by-file summary.
- Follow Conventional Commits exactly: `<type>(<optional-scope>): <subject>`.
- Keep the title terse, imperative, and usually under 72 characters.
- Add a body only when the change is large, cross-cutting, or hard to understand from the title alone. If used, write 2-3 short sentences about motivation, behavior change, or impact.
- Do not invent issue numbers, scopes, or facts that are not supported by the diff or conversation.

## Safety

- Never create an empty commit.
- Never amend unless the user explicitly asks.
- Do not commit obvious secrets or credential files.
- If the user did not narrow scope, commit the current worktree changes that belong to the task.
- If hooks modify files during commit, inspect the result, stage the hook changes, and create a new normal commit instead of amending.

## Conventional commit guidance

Choose the narrowest accurate type:

- `feat`: new user-facing behavior or capability
- `fix`: bug fix or correctness repair
- `docs`: documentation-only change
- `refactor`: structural change without behavior change
- `test`: add or update tests
- `build`: build, tooling, or dependency workflow changes
- `ci`: CI or automation pipeline changes
- `chore`: maintenance that fits none of the above

Use a scope only when it adds clarity, for example `feat(opencode): ...`.

## Workflow

1. Inspect status, staged diff, unstaged diff, and recent commit subjects.
2. Decide whether to include all current changes or only a clearly requested subset.
3. Stage the intended files.
4. Draft the commit message:
   - title: terse conventional commit subject
   - body: omit for small changes; otherwise 2-3 sentences
5. Create the commit.
6. After the commit succeeds, show the exact committed message back to the user in a fenced code block.

## Output

After committing, report:

- the final conventional commit subject
- the body if one was used
- the short hash

If there is nothing to commit, say that plainly and stop.
