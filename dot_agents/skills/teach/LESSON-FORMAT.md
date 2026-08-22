# Lesson Manifest Format

Lesson manifests live in `./lessons/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. Create the directory lazily — only when the first lesson is published.

A lesson is one Sideshow **session** of small posts. This file is the durable pointer back to that session. The teaching happens in Sideshow, not in this file.

## Template

```md
# {Lesson title}

{One or two sentences: the single win this lesson gives, and how it serves the mission.}

- Date: {YYYY-MM-DD}
- Session: `{sessionId}`
- URL: {full Sideshow session URL}
- Posts: `{postId}` {title}; `{postId}` {title}
- Practice: {what the user should do — predict, click, or paste code under a named card}
- Primary source: [{title}]({url})
- Learning records: {links, or "none yet"}
```

## Rules

- **One lesson, one session.** Do not point one manifest at several unrelated sessions.
- **Store `sessionId` and post ids**, not a single vague "surface id."
- **Link the live session**, not a local HTML file.
- **Practice is one line.** What should they do before they ask you to look?
- **Write the manifest after publish**, once you have real ids and a URL.
- **Do not duplicate the lesson prose here.** That lives on the cards.
