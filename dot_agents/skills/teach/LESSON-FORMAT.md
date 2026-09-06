# Lesson Format

Lesson files live in `./lessons/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. Create the directory lazily — only when the first lesson is written.

A lesson is one tightly-scoped teaching unit tied to the mission. The teaching happens in this file and in the conversation.

## Template

```md
# {Lesson title}

{One or two sentences: the single win this lesson gives, and how it serves the mission.}

- Date: {YYYY-MM-DD}
- Practice: {what the user should do — predict, try, or paste code}
- Primary source: [{title}]({url})
- Learning records: {links, or "none yet"}

## Lesson

{The lesson content.}
```

## Rules

- **One lesson, one file.** Do not split one idea across several unrelated lesson files.
- **Practice is one line.** What should they do before they ask you to look?
- **Write the lesson when you teach it.** Do not leave a stub with no content.
- **Do not duplicate the lesson prose into `NOTES.md`.** That file is for preferences and working notes.
