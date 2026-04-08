# PLAN: `/cpimg` browser-assisted image composer for Pi

## Status
Proposed

## Goal
Add a `/cpimg` command for Pi that opens a link to a **prebuilt static webpage** where the user can:
- edit prompt text
- paste/upload multiple images
- assign stable image names
- reference images in text via `@image-name`

On submit, the extension converts the draft into **structured multimodal content** and sends it to Pi with `pi.sendUserMessage(...)`.

## Constraints
- **No custom Pi client / no RPC requirement**
- **No direct attachment to Pi's current unsent TUI draft**
- **No dynamic webpage generation** beyond serving a prebuilt static page and per-session JSON data
- The webpage is the draft editor; Pi receives the final submitted message

## Non-goals
- True image paste into the interactive Pi editor
- Native Pi image-reference syntax (none exists today)
- General-purpose asset management beyond `/cpimg`

## UX
1. User runs `/cpimg` with optional seed text.
2. Pi extension creates a short-lived session token.
3. Pi prints a link like `http://noco/cpimg?t=<token>`.
4. User opens the page on their local machine.
5. The page loads the current draft text and accepts image paste/upload.
6. Each image gets a user-editable name, e.g. `foo`, `bar`, `diagram-1`.
7. User references images in the prompt via `@foo`, `@bar`.
8. User submits.
9. Extension validates the draft, converts it to structured content, calls `pi.sendUserMessage(...)`, then expires the session.

## Core behavior

### 1) Prebuilt static page
The page is committed once and served as static assets.

It should be intentionally barebones:
- textarea for prompt text
- image paste/drag-drop/file input
- rename/delete uploaded image entries
- submit button
- minimal validation/errors

### 2) Session-backed API
The extension owns short-lived session state and exposes a small HTTP API.

Suggested endpoints:
- `GET /cpimg?t=<token>` -> static page
- `GET /api/cpimg/session/<token>` -> session metadata + current draft
- `POST /api/cpimg/session/<token>/upload` -> upload one image
- `DELETE /api/cpimg/session/<token>/upload/<name>` -> delete upload
- `POST /api/cpimg/session/<token>/submit` -> submit final text + image order/names

## `@image-name` semantics
`@image-name` is **web-page syntax only**.

It is converted on submit into **Pi structured content blocks**.

There is no intermediate “Pi syntax” to target.

### Transformation rule
Given:

```text
Compare @foo and @bar. Is @foo blurrier?
```

Build content roughly like:

```ts
[
  { type: "text", text: "Compare image foo:\n" },
  { type: "image", source: { ...foo... } },
  { type: "text", text: "\nAnd image bar:\n" },
  { type: "image", source: { ...bar... } },
  { type: "text", text: "\nIs foo blurrier?" },
]
```

### Reference rules
- First `@name` occurrence inserts the actual image block.
- Later `@name` occurrences stay as plain text references.
- Unknown `@name` is a validation error.
- Duplicate image names are not allowed.
- Image names should be normalized to a safe slug charset.

### Unreferenced uploads
Recommended behavior:
- append them at the end under a short text header like `Additional uploaded images:`

Alternative behavior:
- reject submit until every uploaded image is referenced

Preferred default: **append unreferenced uploads** so nothing is lost.

## Proposed file layout
Because this repo is a chezmoi source repo, Pi files should live under `dot_pi/`.

Suggested placement:
- `dot_pi/agent/extensions/cpimg.ts` — main Pi extension
- `dot_pi/agent/cpimg/index.html` — static page
- `dot_pi/agent/cpimg/app.js` — browser logic
- `dot_pi/agent/cpimg/styles.css` — minimal styling
- optional: `dot_pi/specs/cpimg-spec.md` — fuller long-form spec later

Resulting target paths after chezmoi apply:
- `~/.pi/agent/extensions/cpimg.ts`
- `~/.pi/agent/cpimg/*`

## Extension responsibilities
- register `/cpimg`
- create/track short-lived composer sessions
- lazy-start a tiny HTTP server if needed
- serve static assets + JSON API
- validate uploads and final submit
- build structured content array
- call `pi.sendUserMessage(content)`
- clean up expired/submitted sessions

## HTTP server responsibilities
- serve committed static assets only
- expose the minimal session/upload/submit API
- keep all state in memory initially
- optionally write temp files for uploads if memory-only becomes annoying

## Suggested implementation phases

### Phase 1 — skeleton
- register `/cpimg`
- create in-memory session store
- print session link
- add TTL cleanup

### Phase 2 — static page + upload API
- serve `index.html`, `app.js`, `styles.css`
- upload images
- rename/delete images
- persist prompt text in session state

### Phase 3 — reference parsing
- parse `@name` tokens
- validate unknown refs
- normalize names
- build structured content array

### Phase 4 — submit to Pi
- call `pi.sendUserMessage(...)`
- mark session consumed
- clean up uploads/session state

### Phase 5 — hardening
- file size limits
- MIME whitelist
- TTL expiry UX
- single-submit guarantee
- better error messages

## Security / limits
- tokenized session URLs
- short TTL, e.g. 5–10 minutes
- one-time submit
- MIME whitelist: `image/png`, `image/jpeg`, `image/webp`, optional `image/gif`
- max file size per image
- max image count per session
- bind to localhost/private interface only unless intentionally exposed
- rely on `noco` / tunnel / reverse proxy for local access

## Open questions
1. Should unreferenced uploads be appended or rejected?
2. Should `/cpimg` accept optional seed text or always start blank?
3. Should uploads live in memory only, or temp files + lazy base64 conversion?
4. Should the link be printed only, or also shown in a widget/status line?
5. Should submit auto-close the page, or just show a success state?

## Recommended defaults
- `/cpimg` may accept optional seed text, but blank is fine
- append unreferenced uploads
- temp-file backed uploads to reduce memory pressure
- show a success page instead of relying on `window.close()`
- keep first version minimal and ugly if it works reliably

## Acceptance criteria
- `/cpimg` prints a usable link
- the page loads existing session text
- the page supports paste, drag-drop, and file picker uploads
- uploaded images can be renamed and deleted
- `@image-name` references are validated
- submit produces one Pi multimodal user message
- multiple images work in one submission
- expired or reused tokens fail safely
- all temp/session data is cleaned up after submit or expiry
