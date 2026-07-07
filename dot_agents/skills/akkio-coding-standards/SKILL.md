---
name: akkio-coding-standards
description: Akkio monorepo (~/Akkio) coding standards and design taste for Python (ml/, packages/) and TypeScript/Vue (src/, apps/web-backend-api). Use when writing, reviewing, or designing code in the Akkio monorepo.
---

# Akkio Coding Standards

Follow these standards when writing, reviewing, or designing code in `~/Akkio`. The short version: every piece of data that crosses a boundary gets a real type; every rule the system must always follow lives in exactly one place; logic goes in plain functions with side effects kept at the edges; tests go through the same entry points real callers use; comments explain why, never what.

This skill covers how to write good code, not how to run the repo. For build/test commands, task authoring, and per-area conventions, read the repo's own agent docs (`~/Akkio/CLAUDE.md` / `AGENTS.md`, `MISE.md`, and the nearest child `AGENTS.md`). Pair it with the `codebase-design` skill for the design vocabulary (interface, seam, depth, adapter).

## Core rules

- Every piece of data crossing a boundary (API call, database row, queue message) has a real type: Pydantic models in Python, Zod schema + `z.infer` pairs in TypeScript. No loose dicts, no anonymous payload shapes, no `any`.
- Prefer request/response objects over long parameter lists: keyword-only arguments in Python, options objects with defaults in TypeScript.
- Catch mistakes as early as possible: best when the class is defined, next best when the object is created, last resort at runtime.
- Errors carry answers, not just names: a caller can ask an error what to tell the user and whether retrying makes sense.
- When something fails, choose on purpose whether the code stops loudly or carries on quietly — and every "carry on quietly" spot says what it protects.
- Each rule the system must always follow is owned by exactly one layer; the other layers stay thin.
- Put logic in plain functions first. Only pass in ("inject") a dependency when it is a truly external thing (database, LLM API) that a test needs to swap for a fake. A missing dependency should be visible where the code is called — never quietly replaced by a do-nothing stand-in.
- Rules that apply everywhere get one single enforcement point, not a copy in every caller.
- Prefer lists of what's allowed over lists of what's blocked, pinned by a small guard test so any new entry forces someone to look at it.
- Plain logic in the middle, side effects at the edge: builder and data-cleanup functions hold the logic; a thin outer layer does the actual writes and calls.
- Tests fake only truly external things, and every fake has a comment explaining why it's there.
- Move shared code up a level only when a second user appears; fix problems in shared code at the source instead of patching every caller.
- Improve the code paths you touch, but don't start repo-wide cleanups unless asked.

## Hard rules

These are not style preferences. When they clash with existing code, keep compatibility where old and new meet, and write the new path properly instead of copying the violation.

- Every domain shape crossing a boundary is a typed model; data that was decoded or loaded from storage is not trusted with a cast.
- Generated code is never edited by hand; changes go through the generator that owns it. Database schema migrations have exactly one owner; every other database client only reads that schema.
- Domain types shared by the frontend and backend are declared once, in the web backend's shared types package, with no Vue imports; the frontend imports them and never re-declares them.
- Each always-true rule is implemented in exactly one layer. When Python and TypeScript must run the same check and can't share code, both sides get a comment pointing at the other, plus a test that pins the shape so drift breaks a test instead of production.
- Expected failures get typed errors: in Python, exception families that can answer "what do we tell the user" and "should we retry"; in TypeScript, error classes with matching check functions and a doc comment stating where they're thrown and caught.
- Code that swallows a failure and carries on logs a warning and has a comment naming what that tolerance protects. Silent defaults are out.
- Tests check results a caller can see, through the interface callers actually use; fakes are reserved for truly external things and explained at the fake.
- Comments record why, backed by evidence; comments that retell what the code does are out.

## How to apply the standards

1. **Look around first.** Before picking a pattern, schema style, error shape, or test approach, read the surrounding package until you know what it already does (or confirm it does nothing yet).
2. **Name the kind of change.** Python design, TypeScript design, a dependency, where a module should live, tests, or comments.
3. **Open every matching topic file.** This page is only the map.
4. **Standards beat neighbors.** Follow the existing architecture where it fits. When nearby code breaks a hard rule, keep compatibility at the meeting point and write your path properly.
5. **Make the smallest complete change.** No unrelated migrations, no "just in case" abstractions, no new swap points without a second implementation.
6. **Verify through the front door.** Tests watch results at the interface real callers use.
7. **Say the trade-offs out loud.** If fully following a standard would need a big migration, state the limit and what you improved locally.

## Topic routing

Load the files whose triggers match the task.

| If the change touches... | Load... |
|---|---|
| Python: package layout, typing, errors, API shape, async, test style | [`PYTHON.md`](PYTHON.md) |
| TypeScript/Vue: schemas, types, errors, stores, composables, API surface | [`TYPESCRIPT.md`](TYPESCRIPT.md) |
| A dependency: database, cache/queue, workflow engine, LLM providers, warehouses, internal services | [`SEAMS.md`](SEAMS.md) |
| Where a module should live, growing vs adding modules, which layer owns a rule, splitting logic from effects | [`DEPTH.md`](DEPTH.md) |
| Creating or changing tests | [`TESTING.md`](TESTING.md) |
| Writing or updating comments, docstrings, READMEs | [`COMMENTS.md`](COMMENTS.md) |

## Existing code is not a template

Much of the repo is older than these standards. Before copying a nearby pattern, judge it:

- **The deletion test.** Imagine deleting the module you're about to copy. If the complexity just disappears, it was only passing data along — don't copy it. If its callers would each have to absorb that complexity, the module earns its place.
- **Deep vs shallow.** A module is "deep" when a small public surface hides a lot of work, and "shallow" when its public surface is nearly as complicated as its insides — lots of thin forwarding methods, sprawling config objects, dict-in/dict-out. Don't copy shallow shapes; aim for fewer methods, simpler parameters, more hidden inside.
- **Standards beat neighbors.** When surrounding code disagrees with these files, follow the standards on the path you're changing. Don't start a repo-wide migration unless asked.

## Common excuses, and why they don't fly

- **"I'll add a helper to utils.py / utils.ts."** A utils file is a junk drawer — shallow by construction. Find the module whose job this behavior really is, or create a new module named after that job.
- **"A wrapper class per provider/datasource is architecture."** A class that forwards every call adds nothing. A wrapper earns its place only when it hides a real difference behind a shared interface.
- **"The frontend needs its own copy of this type/check."** Import it from the shared types package. A copy will drift out of sync — it's a bug scheduled for later.
- **"The existing code does it this way."** Keep compatibility where old and new meet; the path you're changing follows the standards.
- **"Validation is enough."** Don't just check the data — parse it into the typed model and pass that typed value onward.
