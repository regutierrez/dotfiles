---
name: plannotator-tui
description: Open a Markdown plan or document for the human to review and annotate in a Herdr pane; their feedback arrives as the next message. Use when a plan, specification, or design document needs human review before implementation.
---

# Hand a document to the human for review

Use this workflow only when `HERDR_ENV=1`. Otherwise, tell the human where the file is and ask them to review it.

1. Write the document to a file. Do not also paste it into chat.
2. Open it for review from your pane:

   ```bash
   plannotator-tui herdr open docs/plans/auth.md
   ```

3. End your turn. Do not wait, poll, or read the review pane. The review arrives as the next user message with numbered feedback:

   ```text
   ## Annotation 1 (line 12)
   Comment on: "Rotate the token on every…"
   > Rotation on every privilege change will log people out…
   ```

Address every annotation before you continue.

When you list files for the human to open, print them as `file://` hyperlinks so Ctrl-click in Herdr opens them in Plannotator TUI:

```bash
printf '\e]8;;file://%s\e\\%s\e]8;;\e\\\n' "$PWD/docs/plans/auth.md" "docs/plans/auth.md"
```
