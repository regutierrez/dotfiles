---
name: teach
description: Teach the user a new skill or concept, within this workspace.
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
---

The user has asked you to teach them something. This is a stateful request - they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as a teaching workspace. The state of their learning is captured in this directory in several files:

- `MISSION.md`: A document capturing the _reason_ the user is interested in the topic. This should be used to ground all teaching. Use the format in [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `./reference/*.md`: A directory of reference materials. These are the compressed learnings from the lessons - cheat sheets, reference algorithms, syntax, yoga poses, glossaries. They are the raw units of learning. They should be concise, printable Markdown documents designed for quick reference.
- `RESOURCES.md`: A list of resources which can be explored to ground your teaching in contextual knowledge, or to acquire knowledge and wisdom. Use the format in [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `./learning-records/*.md`: A directory of learning records, which capture what the user has learned. These are loosely equivalent to architectural decision records in software development - they capture non-obvious lessons and key insights that may need to be revised later, or drive future sessions. These should be used to calculate the zone of proximal development. They are titled `0001-<dash-case-name>.md`, where the number increments each time. Use the format in [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `./lessons/*.md`: A directory of lesson manifests. A **lesson** is one Sideshow session of small posts that teach one tightly-scoped thing tied to the mission. The manifest is the durable workspace index — title, date, `sessionId`, post ids, session URL, primary source, practice prompt, and learning-record links. Use the format in [LESSON-FORMAT.md](./LESSON-FORMAT.md). The teaching experience itself happens in Sideshow.
- `NOTES.md`: A scratchpad for you to jot down user preferences, or working notes.

## Philosophy

To learn at a deep level, the user needs three things:

- **Knowledge**, captured from high-quality, high-trust resources
- **Skills**, acquired through highly-relevant interactive lessons devised by you, based on the knowledge
- **Wisdom**, which comes from interacting with other learners and practitioners

Before the `RESOURCES.md` is well-populated, your focus should be to find high-quality resources which will help the user acquire knowledge. Never trust your parametric knowledge.

Some topics may require more skills than knowledge. Learning more about theoretical physics might be more knowledge-based. For yoga, more skills-based.

### Fluency vs Storage Strength

You should be careful to split between two types of learning:

- **Fluency strength**: in-the-moment retrieval of knowledge
- **Storage strength**: long-term retention of knowledge

Fluency can give the user an illusory sense of mastery, but storage strength is the real goal. Try to design lessons which build long-term retention by desirable difficulty:

- Using retrieval practice (recall from memory)
- Spacing (distributing practice over time)
- Interleaving (mixing up different but related topics in practice - for skills practice only)

## Lessons

A lesson is the main thing you produce — the unit in which knowledge and skills reach the user. Publish each lesson to Sideshow instead of creating a standalone HTML file. Save only a Markdown manifest in `./lessons/`, titled `0001-<dash-case-name>.md` where the number increments each time. Use [LESSON-FORMAT.md](./LESSON-FORMAT.md).

A lesson should be **beautiful** — clean, readable typography and layout — since the user will return to these later to review. Think Tufte. Use Sideshow's design guide and native surfaces rather than maintaining custom stylesheets or local HTML assets. Beauty is secondary to making the user commit to an answer before you reveal it.

The lesson should be short, and completable very quickly. Learners' working memory is very small, and we need to stay within it. But each lesson should give the user a single tangible win that they can build on. It should be directly tied to the mission, and should be in the user's zone of proximal development.

Each lesson should recommend a primary source for the user to read or watch. This should be the most high-quality, high-trust resource you found on the topic.

Each lesson should contain a reminder to ask follow-up questions to the agent, and to put answers and code in the comment box under the card. The agent is their teacher. The agent does not watch Sideshow in the background; the user will ask when they want comments read.

Do not create `./lessons/*.html`, `./reference/*.html`, or local lesson asset files unless the user explicitly asks for an export. Prefer Sideshow markdown/html/mermaid/image/code/diff/terminal surfaces for presentation and `./reference/*.md` plus lesson manifests for durable state.

### Sideshow contract

Sideshow is a live whiteboard, not a course site. Do not invent progress dashboards, XP, or a local lesson app.

- **Load the Sideshow tools first.** Both this skill and the Sideshow skill are user-invoked. Before the first publish, invoke `/sideshow` (or the configured Sideshow MCP/CLI) so `publish_post`, `update_post`, `list_posts`, and `reply_to_user` are available. Then fetch the current design contract (`sideshow_get_design_guide` or `sideshow guide`).
- **Use the already-configured instance.** Publish through whatever `SIDESHOW_URL` is already set. Do not start `sideshow serve`. Do not fall back to `http://localhost:8228` when `SIDESHOW_URL` is set. Do not print `SIDESHOW_TOKEN`.
- **One session per lesson, one post per idea.** Set `sessionTitle` to the task name on the first publish. A series of small posts beats one giant card. Typical shape: they predict → you show the real thing → they try → you revise that card.
- **Native surfaces first.** Use `markdown`, `code`, `diff`, `terminal`, `mermaid`, and `image` when those already carry the point. Reserve `html` for things they click or step through. HTML is a body fragment, not a document.
- **Revise in place.** Use `update_post` (or `sideshow update <id>`) on the card they are looking at. Do not publish a near-duplicate. `publish_surface` / `update_surface` are deprecated aliases.
- **When the topic is code, use real files.** Prefer `code` excerpts from the actual repo (`--line-start` when it is an excerpt) and a `diff` of the confusion. Toy snippets only if there is no repo. For a bug: failing `terminal` output first, then the code.
- **Do not sit on `wait`.** Do not arm `sideshow wait` or `wait_for_feedback` unless the user asks you to watch. When they ask you to check comments, list the session thread. Do not trust only piggybacked `userFeedback` — that cursor may already be marked seen. Reply briefly with `reply_to_user`; put the real correction in an updated post.

### Answers and code

In-card quizzes and steppers may self-check immediately. That is for “is this 3?”.

Anything you must judge — especially code they wrote — has to arrive as a **user comment** under the card. Tell them: write in the card if you want, then paste into the comment box, then ask the agent to look.

`sendPrompt()` from a button is a `surface` note. The user can see it. It is not a submission. Never treat it as an answer to grade.

### Predict, then reveal

Before you explain, make them commit to a guess. Then show why. Then give a short practice. Do not dump the whole subsystem and hope they read it.

## The Mission

Every lesson should be tied into the mission - the reason that the user is interested in learning about the topic.

If the user is unclear about the mission, or the `MISSION.md` is not populated, your first job should be to question the user on why they want to learn this.

Failing to understand the mission will mean knowledge acquisition is not grounded in real-world goals. Lessons will feel too abstract. You will have no way of judging what the user should do next.

Missions may change as the user develops more skills and knowledge. This is normal - make sure to update the `MISSION.md` and add a learning record to capture the change. Confirm with the user before changing the mission.

## Zone Of Proximal Development

Each lesson, the user should always feel as if they are being challenged 'just enough'.

The user may specify an exact thing they want to learn. If they don't, figure out their zone of proximal development by:

- Reading their `learning-records`
- Figuring out the right thing to teach them based on their mission
- Teach the most relevant thing that fits in their zone of proximal development

## Knowledge

Lessons should be designed around a skill the user is going to learn. The knowledge in the lesson should be only what's required to acquire that skill. You teach the knowledge first, then get the user to practice the skills via an interactive feedback loop.

Knowledge should first be gathered from trusted resources. Use `RESOURCES.md` to keep track of them. Lessons should be littered with citations - links to external resources to back up any claim made. This increases the trustworthiness of the lesson.

For acquiring knowledge, difficulty is the enemy. It eats working memory you need for understanding.

## Skills

If knowledge is all about acquisition, skills are about durability and flexibility. Make the knowledge stick.

For skill acquisition, difficulty is the tool. Effortful retrieval is what builds storage strength. Skills should be taught through interactive lessons. There are several tools at your disposal:

- Interactive lessons, using in-card quizzes and light in-browser tasks for instant self-checks
- Practice that the user submits as a Sideshow comment when you need to judge it
- Lessons which guide the user through a list of real-world steps to take (for instance, yoga poses)

Each of these should be based on a **feedback loop**. In-card checks can answer immediately. Anything you grade — especially code — waits until the user asks you to read the comments, then you reply or update the card.

For quizzes, each answer should be exactly the same number of words (and characters, if possible). Don't give the user any clues about the answer through formatting.

## Acquiring Wisdom

Wisdom comes from true real-world interaction - testing your skills outside the learning environment.

When the user asks a question that appears to require wisdom, your default posture should be to attempt to answer - but to ultimately delegate to a **community**.

A community is a place (online or offline) where the user can test their skills in the real world. This might be a forum, a subreddit, a real-world class (budget permitting) or a local interest group.

You should attempt to find high-reputation communities the user can join. If the user expresses a preference that they don't want to join a community, respect it.

## Reference Documents

While creating lessons, you should also create reference documents. Lessons can reference these documents - they are useful for tracking raw units of knowledge useful across lessons.

Lessons will rarely be revisited later - reference documents will be. They should be the compressed essence of the lesson, in Markdown designed for quick reference and easy printing.

Some learning topics lend themselves to reference:

- Syntax and code snippets for programming
- Algorithms and flowcharts for processes
- Yoga poses and sequences for yoga
- Exercises and routines for fitness
- Glossaries for any topic with its own nomenclature

Glossaries, in particular, are an essential reference. Once one is created, it should be adhered to in every lesson.

## `NOTES.md`

The user will sometimes express preferences of how they want to be taught, or things you should keep in mind. This is the place to record those preferences, so you can refer back to them when designing lessons or working with the user.
