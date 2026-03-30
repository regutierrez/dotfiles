---
description: Draft and create a conventional commit for the current changes using the commit skill
---

You are running the `/commit` workflow.

User arguments: `$ARGUMENTS`

Immediately invoke `/skill:commit` and follow it. If skill invocation is unavailable, follow the same workflow directly.

Extra requirements for this run:

- Use `$ARGUMENTS` and the current conversation as extra intent for the commit message.
- Read both staged and unstaged changes before drafting the message.
- Commit the intended current changes with a Conventional Commits title.
- Add a 2-3 sentence body only when the change is big enough to need it.
- After the commit succeeds, show the exact message that was committed.
- If there is nothing to commit, say so and stop.
