# OpenTUI frontend for Pi — implementation plan

## 1. Goal

Build a fast, full-screen TUI for Pi using OpenTUI and the useful architectural patterns from OpenCode v2, without forking Pi or coupling the UI to OpenCode's backend.

The first release should:

- preserve Pi as the agent/runtime source of truth;
- load normal Pi extensions, skills, prompts, tools, settings, and sessions;
- stream messages and tool progress smoothly;
- remain responsive with long sessions;
- recover the terminal cleanly after crashes and signals;
- ship as a separate `pi-tui` command until it reaches parity with stock Pi.

This plan deliberately does **not** promise byte-for-byte compatibility with extensions that render `@earendil-works/pi-tui` components. OpenTUI and Pi's current TUI are different component systems. The compatibility boundary is defined in [Extension compatibility](#7-extension-compatibility).

## 2. Research baseline

Research was pinned so implementation agents can inspect the same source rather than whatever happens to be on a moving branch.

| Project | Snapshot | Important starting points |
|---|---|---|
| OpenTUI | [`34e78b2` (0.4.5)](https://github.com/anomalyco/opentui/tree/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1) | [`renderer.ts`](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/renderer.ts), [`Renderable.ts`](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/Renderable.ts), [`ScrollBox.ts`](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/renderables/ScrollBox.ts), [test renderer](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/testing/test-renderer.ts) |
| OpenCode v2 TUI | [`c228fc4`](https://github.com/anomalyco/opencode/tree/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui) | [`app.tsx`](https://github.com/anomalyco/opencode/blob/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui/src/app.tsx), [`client.tsx`](https://github.com/anomalyco/opencode/blob/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui/src/context/client.tsx), [`data.tsx`](https://github.com/anomalyco/opencode/blob/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui/src/context/data.tsx), [`rows.ts`](https://github.com/anomalyco/opencode/blob/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui/src/routes/session/rows.ts), [`prompt`](https://github.com/anomalyco/opencode/blob/c228fc48866f06af74d6c7f579181d03fa74b325/packages/tui/src/component/prompt/index.tsx) |
| Pi | installed `@earendil-works/pi-coding-agent` 0.81.1 | local `docs/sdk.md`, `docs/rpc.md`, `docs/extensions.md`, `docs/tui.md`, `docs/session-format.md` |

Current local constraints:

- `bun` is not installed.
- Node is `v24.14.1`.
- OpenTUI's safe production runtime is Bun `>=1.3`; its Node renderer currently requires Node 26.4 with experimental FFI.
- `dot_pi/agent/package.json` declares Pi packages `^0.80.2`, while the globally installed Pi is 0.81.1. The frontend must test against the **runtime Pi executable**, not assume the shared extension package version is identical.
- The repository already has unrelated changes. Implementation agents must only touch files named by their current task.

## 3. Non-negotiable architecture decisions

### D1. Use Pi's RPC mode for v1

Run the OpenTUI frontend as a Bun process and spawn Pi as a child process:

```text
Bun + OpenTUI frontend
        │ strict LF-delimited JSONL over pipes
        ▼
pi --mode rpc (Pi's supported Node runtime)
        │
        ├─ Pi extensions, tools, hooks, commands
        ├─ skills, prompts, settings, auth
        └─ Pi session files and agent execution
```

Why this is the default:

1. It avoids betting that the Pi SDK and all installed extensions run correctly under Bun.
2. It uses Pi's documented custom-UI integration protocol.
3. It matches OpenCode v2's clean client/projection/view separation.
4. JSONL overhead is negligible compared with model/network latency if updates are coalesced correctly.
5. A later same-process SDK adapter can implement the same frontend-owned interface without rewriting views.

Do **not** import Pi's SDK from view, state, prompt, or UI modules in v1. Only the optional future `SdkPiAdapter` may import it.

RPC is not full stock-TUI parity. Pi 0.81.1 exposes prompting/queues/abort, bash, state/messages/entries/tree reads, model/thinking controls, compaction/retry, session stats, HTML export, new/switch/fork/clone/name, commands, and extension UI requests. It does **not** expose session listing/deletion, same-file tree navigation, import/export JSONL, login/logout, reload, share, active-tool management, or every setting. The plan must not assign those missing operations as ordinary RPC work.

For v1:

- build the resume picker from a **read-only** catalog of documented Pi JSONL session files, then pass the selected path to `switch_session`;
- use stock `pi /login` for authentication setup, then restart `pi-tui`;
- defer deletion, same-file tree navigation, import/JSONL export, reload, share, and active-tool management until Pi adds a public RPC operation or a separately approved public bridge exists;
- never import private Pi `dist/` modules or send stock interactive commands such as `/login` through `prompt`—built-in TUI commands are not extension commands and will not execute in RPC mode.

### D2. Use Solid for the shell, but bound transcript nodes

Use pinned `@opentui/solid` for application composition because OpenCode v2 is the closest working reference. Use stable keyed rows and an explicitly windowed transcript. OpenTUI viewport culling is not virtualization: Yoga still visits retained nodes.

If the Phase 1 benchmark fails the budgets below, replace only the transcript renderer with an imperative `@opentui/core` controller. Do not rewrite the whole shell.

### D3. Pi remains the source of truth

The frontend may project and cache Pi state, but it must not invent competing persistence for:

- agent messages or tool results;
- session trees, names, compactions, labels, or model changes;
- active tools, extension commands, auth, model catalog, or thinking level.

Frontend-only persistence is allowed for UI preferences, prompt history/stash, window measurements, and feature flags.

### D4. Copy patterns, not OpenCode domain code

Reuse these patterns:

- host-injected backend adapter;
- normalized event algebra;
- snapshot plus event projection;
- transcript row projection;
- one command registry;
- modal stack and focus restoration;
- renderer-owned lifetime and reverse cleanup.

Do not copy OpenCode's generated client, event names, server store, provider/integration protocol, plugin runtime, location/workspace model, or giant `DataProvider` switch.

### D5. Ship beside stock Pi

The command is `pi-tui`. Do not replace or alias `pi` automatically. Stock Pi remains the rollback path and the way to use Pi-TUI-specific extensions until compatibility improves.

## 4. Proposed source layout

Chezmoi source paths are shown. They render under `~/.pi/agent/opentui/` and `~/.local/bin/pi-tui`.

```text
dot_pi/agent/opentui/
├── package.json
├── bun.lock
├── tsconfig.json
├── README.md
├── src/
│   ├── index.tsx                       # CLI parsing and run()
│   ├── app.tsx                         # renderer lifetime and provider composition
│   ├── backend/
│   │   ├── types.ts                    # frontend-owned PiBackend contract/events
│   │   ├── rpc-client.ts               # child process + strict JSONL framing
│   │   ├── rpc-adapter.ts              # RPC commands/events -> PiBackend
│   │   ├── rpc-schema.ts               # runtime validation/narrowing
│   │   ├── session-catalog.ts           # read-only documented JSONL session index
│   │   └── fake-adapter.ts             # deterministic tests
│   ├── runtime/
│   │   ├── lifecycle.ts                # finalizers, signals, cleanup order
│   │   ├── diagnostics.ts               # stderr, extension/runtime errors
│   │   └── paths.ts
│   ├── state/
│   │   ├── connection.tsx
│   │   ├── session.tsx                 # state/name/model/queue metadata
│   │   ├── transcript.tsx              # canonical entries + streaming overlay
│   │   ├── transcript-reducer.ts       # pure event reducer
│   │   ├── transcript-index.ts          # entry/tool IDs -> indexes
│   │   ├── extension-ui.tsx             # RPC extension UI requests
│   │   └── preferences.tsx
│   ├── commands/
│   │   ├── types.ts
│   │   ├── registry.tsx                # one command source of truth
│   │   ├── defaults.ts                 # frontend implementations of Pi built-ins
│   │   └── palette.tsx
│   ├── routes/
│   │   ├── router.tsx
│   │   ├── home.tsx
│   │   ├── settings.tsx
│   │   └── session/
│   │       ├── index.tsx
│   │       ├── rows.ts                 # pure Pi entries -> stable UI rows
│   │       ├── transcript.tsx           # windowing and sticky scroll
│   │       ├── row.tsx
│   │       ├── tool.tsx
│   │       └── footer.tsx
│   ├── prompt/
│   │   ├── index.tsx
│   │   ├── model.ts                    # structured draft and attachments
│   │   ├── submit.ts                   # one guarded submit path
│   │   ├── history.ts
│   │   ├── autocomplete.tsx
│   │   └── external-editor.ts
│   ├── extension-ui/
│   │   ├── bridge.ts                   # request -> modal/widget/status action
│   │   ├── dialog-select.tsx
│   │   ├── dialog-confirm.tsx
│   │   ├── dialog-input.tsx
│   │   └── dialog-editor.tsx
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── generic.tsx
│   │   ├── bash.tsx
│   │   ├── read.tsx
│   │   ├── edit.tsx
│   │   ├── write.tsx
│   │   └── search.tsx
│   ├── ui/
│   │   ├── dialog-stack.tsx
│   │   ├── toast.tsx
│   │   ├── error-boundary.tsx
│   │   ├── reconnecting.tsx
│   │   └── primitives.tsx
│   ├── theme/
│   │   ├── schema.ts
│   │   ├── provider.tsx
│   │   └── defaults.ts
│   └── util/
│       ├── frame-batcher.ts
│       ├── persistence.ts
│       ├── clipboard.ts
│       └── errors.ts
├── test/
│   ├── fixtures/rpc/
│   ├── rpc-client.test.ts
│   ├── rpc-adapter.test.ts
│   ├── transcript-reducer.test.ts
│   ├── transcript-rows.test.ts
│   ├── transcript-window.test.tsx
│   ├── prompt-submit.test.tsx
│   ├── extension-ui.test.tsx
│   ├── lifecycle.test.tsx
│   └── performance.test.tsx
└── scripts/
    ├── record-rpc-fixture.ts
    ├── benchmark-transcript.ts
    └── terminal-smoke.ts

dot_local/bin/executable_pi-tui          # tiny exec wrapper; no logic
```

Dependency direction:

```text
routes / prompt / ui
          ↓
state / commands / theme
          ↓
backend/types
          ↑
backend/rpc-adapter  (the only live Pi transport)
```

`state`, reducers, and row projection must not import OpenTUI. This is what keeps them cheap to test and allows a later SDK adapter.

## 5. Frontend-owned contracts

Define these before writing UI components. Names may change once, during Phase 2; after that they are contracts.

```ts
interface PiBackend {
  start(): Promise<PiSnapshot>;
  subscribe(listener: (event: PiUiEvent) => void): () => void;
  prompt(input: PromptInput): Promise<{ accepted: boolean }>;
  steer(input: PromptInput): Promise<void>;
  followUp(input: PromptInput): Promise<void>;
  abort(): Promise<void>;
  request<T>(command: PiCommand): Promise<T>;
  respondToExtensionUI(response: ExtensionUIResponse): Promise<void>;
  dispose(): Promise<void>;
}

type PiUiEvent =
  | { type: "connection.changed"; state: "starting" | "ready" | "failed"; error?: string }
  | { type: "agent.started" }
  | { type: "agent.settled" }
  | { type: "message.started"; message: unknown }
  | { type: "message.delta"; block: "text" | "thinking" | "tool"; delta: unknown }
  | { type: "message.completed"; message: unknown }
  | { type: "tool.started"; id: string; name: string; args: unknown }
  | { type: "tool.updated"; id: string; result: unknown }
  | { type: "tool.completed"; id: string; name: string; result: unknown; isError: boolean }
  | { type: "bash.completed"; id: string; command: string; result: unknown; excludeFromContext: boolean }
  | { type: "queue.changed"; steering: string[]; followUp: string[] }
  | { type: "compaction.changed"; state: string; detail?: unknown }
  | { type: "retry.changed"; state: string; detail?: unknown }
  | { type: "extension.ui"; request: ExtensionUIRequest }
  | { type: "extension.error"; extensionPath: string; error: string }
  | { type: "runtime.stderr"; line: string };
```

Rules:

- Preserve raw RPC payloads only inside adapter/fixture code.
- Runtime-validate every stdout object before dispatch.
- Unknown event types become diagnostics; they must not crash the renderer.
- Pi's RPC `bash` command returns a response but emits no message event. The adapter must create a frontend `bash.completed` event from that response, then reconcile against the next snapshot; it must not wait for a nonexistent stream event.
- Malformed JSON on stdout is a fatal protocol error. Include the offending byte-safe excerpt in diagnostics, stop accepting input, and offer stock-Pi fallback instructions.
- Never parse child stdout with Node/Bun `readline`; Pi requires strict LF framing because U+2028/U+2029 are valid inside JSON strings.
- Keep child stderr separate from protocol stdout.

## 6. State and streaming model

### Canonical state

Use Pi session entries as canonical finalized history:

1. At startup, fetch `get_state`, `get_entries`, `get_commands`, and available model data.
2. Rebuild the active branch by walking `parentId` from `leafId`.
3. During a run, apply streaming events to a separate ephemeral overlay keyed by tool-call ID/content index.
4. At `agent_settled`, call `get_entries` with the last canonical entry ID, append returned entries, then discard reconciled ephemeral rows.
5. After the v1 replacement operations—new, switch/resume, fork, or clone—discard the old projection and perform a full snapshot for the replacement session. Add tree navigation/import here only if a future public backend operation supports them.

Do not attempt to reproduce Pi's compaction context-building rules in the UI. Display persisted compaction and branch-summary entries; Pi decides what reaches the model.

### Transcript rows

`rows.ts` is a pure projection from active-branch entries plus ephemeral stream state to stable row descriptors:

```ts
type TranscriptRow =
  | { id: string; kind: "user"; message: unknown }
  | { id: string; kind: "assistant-text"; markdown: string; streaming: boolean }
  | { id: string; kind: "thinking"; text: string; collapsed: boolean }
  | { id: string; kind: "tool"; toolCallId: string; name: string; state: ToolState }
  | { id: string; kind: "summary"; summaryType: "compaction" | "branch"; text: string }
  | { id: string; kind: "custom"; customType: string; data: unknown }
  | { id: string; kind: "status"; status: string };
```

A row ID must be derived from a Pi entry ID, tool-call ID, or deterministic ephemeral ID. Array index is not a valid key.

### Frame batching

- Append text/thinking deltas immediately to plain state, but request at most one visual update per renderer frame.
- Coalesce accumulated `tool_execution_update` values to at most 30 visual updates/second per tool.
- Final `message_end` and `tool_execution_end` events always flush immediately.
- Never enable OpenTUI's global continuous render loop for ordinary streaming. Use invalidation-driven rendering and temporary live requests only for visible animation.

### Transcript windowing

- Keep visible rows plus an overscan of at most two viewports mounted.
- Cache measured row heights by `(rowId, width, expansionState, themeRevision)`.
- Represent unmounted rows with top/bottom spacer heights.
- When rows above the viewport are added, removed, expanded, or remeasured, compensate `scrollTop` so the visible content does not jump.
- Sticky-bottom follows new output only while the user is at the bottom. If the user scrolls up, show a “new output” marker and do not steal their position.
- Large tool output, diffs, and reasoning start collapsed and mount their expensive renderer only when expanded.

## 7. Extension compatibility

Pi RPC already loads extensions and exposes its extension UI sub-protocol. Support it explicitly rather than pretending both TUI component systems are interchangeable.

| Pi extension capability | v1 support | Implementation |
|---|---:|---|
| lifecycle/input/tool hooks | Full | Runs inside Pi RPC child unchanged. |
| custom tools | Full execution | Pi executes them; unknown tools use generic rendering. |
| extension commands | Full | Merge `get_commands` into palette/slash autocomplete; invoke through `prompt`. |
| skills and prompt templates | Full | Pi expands them; expose returned command metadata. |
| provider registration and existing auth | Backend only | Providers/extensions load normally and stored credentials are used. RPC has no login/logout commands; setup stays in stock Pi for v1. |
| session persistence/custom entries | Full persistence | Pi owns the session file; frontend renders unknown custom entries generically. |
| `ui.select/confirm/input/editor` | Full | Render OpenTUI modals and send matching `extension_ui_response`. Respect timeout/cancel. |
| `ui.notify` | Full | Toast plus diagnostics history. |
| string `ui.setWidget` | Full | Named above/below-composer widget regions. |
| `ui.setStatus` | Full | Named status registry in footer. |
| `ui.setTitle` | Full | Set/clear terminal title through one lifecycle owner. |
| `ui.setEditorText` | Full | Replace the current draft without submitting. |
| `ui.custom()` | Not in v1 | Pi RPC intentionally returns `undefined`; stock Pi remains fallback. |
| component-factory widgets | Not in v1 | RPC only transports string arrays. |
| custom Pi-TUI footer/header/editor | Not in v1 | These are no-ops in RPC mode. |
| custom tool/message/entry renderers returning Pi-TUI components | Not in v1 | Use frontend generic/tool-specific renderers; do not execute foreign component factories. |
| raw terminal input listeners | Not in v1 | RPC does not expose them. |
| theme object manipulation from extensions | Not in v1 | RPC degrades these APIs. |

Required UX:

- The compatibility screen must explain the global RPC capability tiers above. RPC does not reveal enough information to classify every extension automatically, so do not invent per-extension compatibility labels.
- Unsupported capabilities must not be described as bugs in the extension.
- README must show the one-command fallback: exit `pi-tui`, run `pi -c` (or use the exact session path shown by the frontend).
- Never silently add an auto-approve or permission-bypass layer to make an extension work.

## 8. Commands, keybindings, focus, and modals

Use one command registry for:

- keyboard shortcuts;
- command palette;
- slash autocomplete;
- help/hotkey dialog;
- extension commands;
- enabled/disabled state and descriptions.

Command precedence:

1. focused textarea editing/IME;
2. active blocking extension UI or permission dialog;
3. top application modal;
4. current route/pane;
5. global commands.

The dialog manager owns a stack. On open, record the focused renderable ID and activate a modal keymap layer. On close, restore the last still-live target or the composer. A full-screen backdrop intercepts mouse input. Escape closes only the top modal unless that modal defines its own confirmation behavior.

Do not scatter global `renderer.keyInput` listeners across components.

## 9. Performance budgets

Budgets are measured on fixtures, not guessed from subjective feel. Record machine/runtime metadata with every benchmark.

| Scenario | Required result |
|---|---|
| Idle screen | No continuous frames; frontend CPU settles below 1% on the reference machine. |
| Typing while 100 text deltas/sec arrive | p95 input-to-frame under 33 ms; no lost/reordered characters. |
| Streaming rendering | At most one normal visual commit per frame; tool progress capped at 30 Hz. |
| 10,000 heterogeneous transcript rows | Mounted renderable count remains bounded by window + overscan, not total row count. |
| Scroll long transcript | p95 frame under 33 ms; no viewport jump during prepend or row expansion. |
| Resize 10,000-row fixture | p95 settle under 100 ms after the final resize event. |
| Large tool output (50 KB/2,000 lines) | Collapsed update does not mount/render full content; expanding remains cancellable and does not freeze input. |
| Protocol parser | Handles split UTF-8, multiple records/chunk, CRLF input, U+2028/U+2029 in strings, and a 50 MB synthetic stream without quadratic growth. |
| Shutdown/crash | Raw mode, cursor, mouse, paste mode, title, and screen are restored. |

Also record:

- OpenTUI frame stats and `cellsUpdated`;
- mounted row/renderable count;
- event queue lag;
- JS heap/RSS for UI and Pi child separately;
- first UI frame and Pi-ready times.

A phase may not “fix” a missed budget by weakening or deleting the benchmark. Document the measurement, find the owning hot path, and change one variable at a time.

## 10. Implementation phases

Each phase is a reviewable vertical slice. Do not start the next phase until the current acceptance checklist passes.

### Phase 0 — feature selection and dependency approval

**User decisions**

1. Edit the picker in [Appendix A](#appendix-a-opencode-v2-feature-picker). `[x]` means recommended, not yet approved.
2. Approve installing Bun `>=1.3` and adding pinned OpenTUI/Solid dependencies.
3. Confirm whether the MVP should launch a fresh session or continue the most recent session by default. Recommendation: mirror stock Pi—fresh unless `-c`, `-r`, or `--session` is passed.

**Stop rule:** no dependency installation, package-source edits, or executable wiring before approval.

### Phase 1 — package scaffold and runtime proof

**Files**

- `dot_pi/agent/opentui/package.json`
- `dot_pi/agent/opentui/bun.lock`
- `dot_pi/agent/opentui/tsconfig.json`
- `dot_pi/agent/opentui/src/index.tsx`
- `dot_pi/agent/opentui/src/runtime/lifecycle.ts`
- `dot_pi/agent/opentui/test/lifecycle.test.tsx`
- `dot_pi/agent/opentui/scripts/benchmark-transcript.ts`

**Steps**

1. Inspect the published npm tarballs/export maps for `@opentui/core`, `@opentui/solid`, and `@opentui/keymap`; pin exact matching versions. Do not depend on GitHub internals.
2. Create/destroy an alternate-screen renderer in `try/finally`.
3. Render a fixed header, scrollbox, textarea, modal, and status row.
4. Add signal/error cleanup for SIGINT, SIGTERM, SIGHUP, and uncaught failures.
5. Build 1k/10k synthetic transcript fixtures with bounded windowing.
6. Compare a Solid keyed-row implementation to an imperative-core transcript using the same fixture.

**Acceptance**

- `bun test test/lifecycle.test.tsx` passes.
- Renderer restores terminal state after normal exit and every tested signal.
- 10k rows do not create 10k mounted renderables.
- Solid meets the performance budgets. If not, record the result and select the imperative transcript controller before Phase 2.
- No imports below OpenTUI package export maps.

### Phase 2 — strict RPC transport

**Files**

- `src/backend/types.ts`
- `src/backend/rpc-client.ts`
- `src/backend/rpc-schema.ts`
- `src/backend/rpc-adapter.ts`
- `src/backend/fake-adapter.ts`
- `test/fixtures/rpc/*`
- `test/rpc-client.test.ts`
- `test/rpc-adapter.test.ts`

**Steps**

1. Spawn `pi --mode rpc` without a shell. Forward only explicit supported CLI flags.
2. Implement strict LF framing with incremental UTF-8 decoding and a bounded buffer.
3. Correlate responses by request `id`; dispatch events independently.
4. Implement write serialization/backpressure and reject outstanding requests on child exit.
5. Normalize documented Pi events into `PiUiEvent`.
6. Implement only documented RPC operations: state/messages/entries/tree reads, commands, models/thinking, prompt/steer/follow-up/abort, bash/abort-bash, compaction/retry, stats, HTML export, and new/switch/fork/clone/name. Normalize the `bash` command response into `bash.completed` because Pi emits no corresponding message event.
7. Add a capability table in code and tests. Unsupported operations must return a typed `unsupported` result before UI work begins; they must never be approximated with private imports or interactive slash commands.
8. Implement the read-only session catalog from `docs/session-format.md`: scan the configured/default session directory, parse JSONL defensively, filter by header `cwd`, and return paths/names/timestamps for `switch_session`. Do not mutate session files.
9. Record sanitized fixtures from Pi 0.81.1. Strip secrets, paths that identify users, and model content not created for the fixture.

**Acceptance**

- Parser tests cover split/multiple chunks, CRLF, Unicode separators, malformed JSON, oversized record, and child exit.
- A fake prompt streams text and a tool lifecycle in correct order.
- A live smoke test can start Pi, fetch state, submit `Respond only with OK`, receive `agent_settled`, and shut down cleanly. Skip with a clear reason when no model auth is available.
- Child stderr never enters the JSON parser.
- Contract tests prove unsupported login, delete, navigate-tree, reload, import, JSONL-export, share, and active-tool operations are rejected locally with a precise capability message.
- Session-catalog tests cover corrupt/truncated files, custom session directory, cwd filtering, names, and no writes.

### Phase 3 — projection store and transcript rows

**Files**

- `state/session.tsx`
- `state/transcript.tsx`
- `state/transcript-reducer.ts`
- `state/transcript-index.ts`
- `routes/session/rows.ts`
- reducer/row tests

**Steps**

1. Hydrate active-branch entries from `get_entries` and `leafId`.
2. Overlay streaming assistant/tool state without mutating canonical entries.
3. Reconcile persisted entries at `agent_settled` using the entry cursor.
4. Handle queue, compaction, retry, abort, and extension errors.
5. Build stable transcript rows with O(1) entry/tool lookup.
6. Add generation IDs so stale events from an old Pi child/session cannot mutate the replacement session.

**Acceptance**

- Pure reducer tests cover text, thinking, tool input/progress/result/error, parallel tools, abort, retry, compaction, queueing, and replacement-session stale events.
- Snapshot + replay reaches the same finalized state as direct finalized entries.
- Row IDs remain stable while streaming text grows.
- Unknown custom entries/events produce a generic row/diagnostic rather than a crash.

### Phase 4 — first usable vertical slice

**Files**

- `app.tsx`, connection/session route, transcript, row, prompt, generic tool, footer, toast, error boundary.

**Scope**

- multiline composer;
- prompt, steer, follow-up, and abort;
- streaming Markdown/text;
- generic tool lifecycle;
- sticky-bottom transcript with windowing;
- queue display;
- model/thinking/session/context footer;
- copy last assistant response;
- fatal error screen and clean exit.

**Acceptance**

- Complete a real read/tool/answer turn.
- Submit while streaming as both steer and follow-up.
- Abort restores queued text to the composer or an explicit queue editor.
- User scrolling up is not pulled to the bottom.
- 10k-row and 100-delta/sec budgets pass.
- Narrow (40x12), normal (100x30), and wide (180x50) frame snapshots pass.

### Phase 5 — extension bridge and unified commands

**Files**

- `state/extension-ui.tsx`
- `extension-ui/*`
- `commands/*`
- extension UI and command tests

**Steps**

1. Implement every documented RPC `extension_ui_request` method.
2. Resolve dialogs exactly once on select, cancel, timeout, abort, session replacement, or shutdown.
3. Merge extension commands, skills, prompts, and frontend built-ins into one registry.
4. Add command palette, slash autocomplete, and help. Pi RPC command metadata does not expose extension argument-completion callbacks; do not claim or emulate them in v1.
5. Show unsupported Pi-TUI-only capability caveats in diagnostics/README.
6. Test representative local extensions: notification/status, string widget, confirm/select/input/editor, command, custom tool, and session replacement command.

**Acceptance**

- Extension dialogs block the extension request without freezing the frontend.
- Timeout and cancellation send the documented default response.
- Duplicate command names remain invokable by Pi's resolved invocation names.
- Unknown extension tool output renders generically.
- Existing `ui.custom()` extensions fail gracefully as documented and stock Pi fallback is shown.

### Phase 6 — sessions, models, auth, and settings

Implement only features selected for MVP in Appendix A.

Minimum recommended slice, limited to public RPC plus the read-only catalog:

- new, continue (`-c` at child launch), resume/search via the read-only session catalog + `switch_session`, and rename;
- read-only tree display, fork, and clone; same-file tree navigation and deletion remain deferred;
- model picker and thinking-level control for already configured providers;
- a clear “authenticate in stock Pi, then restart” flow; no login/logout UI in v1;
- compact, auto-compaction, retry, and queue-mode controls exposed by RPC;
- HTML export only; JSONL export remains deferred;
- frontend theme and keybindings.

**Acceptance**

- Every session replacement increments generation, clears stale UI, rehydrates, and retains the correct cwd.
- Extension `session_before_*` cancellation is respected.
- Model changes and thinking changes update both Pi and footer state.
- No API key, OAuth code, environment secret, or system-prompt content enters logs, snapshots, or fixture files.
- No Phase 6 code mutates session JSONL files directly. Deletion remains unavailable until it has a public Pi operation and an explicit confirmation flow.

### Phase 7 — common tool renderers and selected OpenCode features

Implement specialized renderers in this order:

1. bash;
2. read;
3. edit/write diff;
4. grep/find/ls;
5. generic extension tool;
6. any selected custom tool renderer based only on stable result data.

Then implement user-selected “Next” features in independent slices. Each slice must name its backend command/event dependency before UI work starts.

**Acceptance per renderer**

- pending, partial, success, error, expanded, collapsed, and malformed details fixtures;
- ANSI/control characters cannot corrupt the terminal;
- 50 KB/2,000-line truncation is visible;
- large data remains lazy while collapsed;
- raw result remains accessible even when structured parsing fails.

### Phase 8 — hardening, packaging, and rollout

**Files**

- `README.md`
- `dot_local/bin/executable_pi-tui`
- package/install source only after explicit approval
- terminal smoke and benchmark scripts

**Steps**

1. Test Ghostty, Kitty, WezTerm/iTerm2, tmux, SSH, Linux, and Windows Terminal where available.
2. Test paste, IME, wide graphemes, selection/copy, mouse, resize storms, suspend/resume, and external editor.
3. Test Pi child crash, renderer crash, extension error, network loss, rate-limit retry, context overflow/compaction, and signal shutdown.
4. Run `chezmoi cat` and a targeted `chezmoi apply -n -v` preview. Do not run real `chezmoi apply` unless asked.
5. Document stock Pi fallback and known extension limitations.
6. Keep `pi-tui` opt-in for at least one release cycle.

**Acceptance**

- `bun test` and `bun run typecheck` pass.
- Performance report records budgets, results, hardware, Bun/OpenTUI/Pi versions, and residual misses.
- Targeted chezmoi preview contains only expected files.
- Exiting after any tested failure leaves the terminal usable without `reset`.
- Removing the wrapper/package restores the previous environment; stock `pi` remains untouched.

## 11. Testing strategy

### Pure tests

- RPC framing and schema narrowing;
- event reducer and session generations;
- active-branch reconstruction;
- row projection;
- transcript window calculations and scroll compensation;
- command precedence;
- prompt submit guard/history/stash;
- safe persistence and redaction.

### OpenTUI frame tests

Use `@opentui/core/testing` with fixed dimensions. Capture character frames and styled spans. Do not sleep; wait for renderer frames/visual idle.

Test:

- narrow/normal/wide responsive layouts;
- dialog stack and focus restoration;
- sticky bottom and “new output” marker;
- extension dialogs/widgets/status;
- tool state transitions;
- resize during streaming;
- theme changes and invalidation.

### Integration tests

Run a fake adapter for deterministic tests, then a small live Pi RPC smoke suite. Live tests must use a temporary agent directory/session directory and must not read or mutate the user's real auth/settings unless explicitly running the manual profile.

### Terminal/PTY tests

Use a PTY to assert terminal restoration after:

- normal quit;
- Ctrl-C while idle and streaming;
- SIGTERM/SIGHUP;
- child crash;
- frontend exception;
- external editor suspend/resume.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| OpenTUI is young and volatile | Pin exact versions and commit references; upgrade only in isolated PRs with frame/perf tests. |
| Bun is not installed | Treat installation as an explicit Phase 0 dependency decision. Do not force Node experimental FFI. |
| Pi RPC changes | Keep raw RPC in one adapter, runtime-validate messages, save versioned fixtures, and show protocol diagnostics. |
| Pi-TUI custom extensions cannot render in OpenTUI | Be honest about the compatibility tier; support RPC UI primitives; retain stock Pi fallback. |
| Long transcript makes Yoga/layout slow | Explicit windowing, measured-height cache, stable rows, lazy heavy content, performance gates. |
| Token/tool updates overwhelm renders | Frame batch text; cap accumulated tool progress at 30 Hz; flush final events immediately. |
| Session replacement leaks stale events | Per-process/session generation IDs and full rehydration after replacement. |
| Child stdout gets polluted | Strict schema/framing, stderr separation, fatal protocol screen, no shell spawn. |
| Terminal left in raw mode | One lifecycle owner, reverse finalizers, `renderer.destroy()` in `finally`, PTY tests. |
| Secrets leak into logs/fixtures | Central redaction, synthetic fixtures, no raw auth/system prompt logging. |
| Copying OpenCode creates backend coupling | Frontend-owned Pi contracts; only adapter knows RPC; no OpenCode imports. |
| Scope explodes into full OpenCode parity | Appendix selection gate; each optional feature is a separate slice with backend dependency named first. |

## 13. Rollback

1. Exit `pi-tui` and run stock `pi -c` or `pi --session <shown-path>`.
2. Disable/remove only `~/.local/bin/pi-tui` and `~/.pi/agent/opentui/`.
3. Do not change Pi session files during rollback; both frontends use Pi's canonical files.
4. Revert Bun/package-source changes separately if they were approved and no other package uses them.
5. Never replace or delete stock Pi as part of this project.

---

## Appendix A: OpenCode v2 feature picker

Edit the first column before implementation. `[x]` means **recommended by this plan**, not user approval. “Pi mapping” distinguishes UI work from OpenCode-only server behavior.

### Core chat and composer

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Multiline composer | M | MVP | Direct OpenTUI textarea. |
| [x] | Send and stream prompts | L | MVP | Pi RPC prompt/events. |
| [x] | Interrupt active turn | M | MVP | Pi RPC abort; optional double-Escape guard. |
| [ ] | Background blocking work | L | Next | Requires a Pi extension/backend contract; not native UI-only work. |
| [x] | Shell mode (`!`) | M | MVP | Pi RPC `bash` and `abort_bash`. |
| [x] | Prompt history | S | MVP | Frontend-local bounded JSONL. |
| [ ] | Prompt stash/pop | M | Next | Frontend-local structured drafts. |
| [ ] | External `$EDITOR` | M | Next | Suspend/resume renderer safely. |
| [ ] | Active IDE/editor context | L | Later | Requires a Pi/editor bridge extension. |
| [x] | Model/thinking footer | S | MVP | Pi state/model/thinking. |
| [x] | Usage/context/cost footer | M | MVP | `get_session_stats`. |
| [ ] | Large-paste placeholder | M | Next | Keep full payload outside textarea display. |
| [ ] | Draft retention across route changes | S | Next | Frontend-local state. |
| [x] | IME and CRLF normalization | M | MVP | OpenTUI input plus submit guard. |

### Sessions and navigation

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | New/resume/continue | M | MVP | New/switch are RPC; continue is a child launch flag; resume list uses the read-only JSONL catalog. |
| [x] | Session browser/search | M | MVP | Read documented session headers/names without mutation, then call RPC `switch_session`. |
| [ ] | Pin sessions and quick slots | S | Next | Frontend-local preferences. |
| [x] | Rename session | S | MVP | RPC `set_session_name`. |
| [ ] | Delete session | M | Later | No RPC operation; do not mutate files until a public Pi bridge and trash semantics are approved. |
| [ ] | Timeline/jump | M | Next | `get_tree` supports display, but RPC lacks same-file `navigateTree`; blocked on public operation. |
| [x] | Fork/clone | M | MVP | Public Pi RPC operations. |
| [ ] | Same-file tree navigation | M | Next | Public RPC gap; do not fake with private APIs. |
| [x] | Compact/summarize | M | MVP | Pi RPC compact. |
| [ ] | Undo/redo with file rollback | L | Next | OpenCode backend feature; requires a Pi checkpoint extension. |
| [ ] | Move session/change directory | M | Next | Session cwd replacement support required. |
| [x] | Transcript page/line/message navigation | M | MVP | Frontend scroll/row index. |
| [ ] | Responsive sidebar | M | Next | UI-only after session route is stable. |
| [ ] | Sidebar context/MCP/LSP status | M | Next | Requires data exposed by Pi/extensions. |
| [ ] | Subagent browser | L | Next | Integrate pi-subagents extension events/tool, not OpenCode child sessions. |
| [ ] | Running-shell browser | M | Later | Requires background-shell extension; Pi intentionally favors tmux. |
| [ ] | Direct next/previous subagent | — | No | Placeholder in OpenCode v2 itself. |

### Messages and tool calls

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Streaming Markdown | L | MVP | OpenTUI Markdown with batched updates. |
| [ ] | Show/hide grouped reasoning | M | Next | Pi thinking content blocks. |
| [ ] | Turn summary/model/duration/tokens | M | Next | Derive from Pi message usage/events. |
| [x] | Common structured tool renderers | L | MVP | Bash/read/edit/write/grep/find/ls first. |
| [x] | Tool pending/progress/success/error | L | MVP | Pi tool execution events. |
| [ ] | Inline diffs and diagnostics | L | Next | Pi edit details patch/diff; diagnostics when present. |
| [ ] | Exploration tool grouping | M | Later | Row projection policy. |
| [ ] | Queued/compaction transcript rows | L | Next | Pi queue/compaction events. |
| [ ] | Per-message actions | M | Next | Pi tree/session APIs. |
| [x] | Copy last assistant message | S | MVP | `get_last_assistant_text`/projected row. |
| [x] | Copy whole transcript | S | MVP | Frontend formatter. |
| [ ] | Rendered Markdown/source toggle | S | Later | UI preference. |
| [ ] | Persistent scrollbar | S | Next | OpenTUI scrollbox option. |

### Models, providers, and auth

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Model picker | M | MVP | Pi available models/set model. |
| [ ] | Model favorites/recents/cycle | S | Next | Pi cycle plus frontend preferences. |
| [ ] | Agent picker/cycle | S | Next | Pi has no OpenCode agent catalog; map to selected frontend/extension concept only if defined. |
| [x] | Thinking levels/model variants | M | MVP | Pi thinking levels; do not copy OpenCode variant model. |
| [ ] | Provider/login picker | M | Next | RPC has no login/logout operation; use stock Pi in v1. |
| [ ] | API-key auth | M | Next | Public RPC gap; frontend must never read or persist credentials. |
| [ ] | OAuth auth | L | Next | Public RPC gap; keep stock Pi flow until exposed. |
| [ ] | Command-based auth | L | Later | Only if a public Pi operation exposes it. |
| [ ] | Multiple credentials/disconnect | M | Next | Public RPC gap. |
| [ ] | MCP management | L | Later | Pi extension-specific; no core MCP. |
| [ ] | Automatic MCP auth prompt | L | Later | Depends on MCP extension events. |

### Commands and palette

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Fuzzy command palette | M | MVP | Unified frontend/Pi command registry. |
| [x] | Slash autocomplete | M | MVP | Pi extension/prompt/skill commands plus frontend built-ins. |
| [x] | Extension-defined commands | M | MVP | Pi `get_commands`; execute through prompt. |
| [x] | Skills selector | M | MVP | Pi skill commands. |
| [ ] | Fully configurable bindings/leader layers | L | Next | OpenTUI keymap plus Pi keybinding mapping. |
| [x] | Shared dialog keyboard navigation | M | MVP | Reusable dialog primitive. |
| [x] | Help/hotkeys dialog | S | MVP | Derived from command registry. |
| [ ] | Which-key overlay | M | Later | OpenCode ships it disabled; add only after keymap stability. |
| [x] | Open docs/quit | S | MVP | OS opener and lifecycle owner. |

### Files and attachments

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | `@` file/directory mentions | M | MVP | Local `fd`/Pi resource search; preserve Pi prompt format. |
| [ ] | Line-range mentions | M | Next | Structured frontend syntax expanded to Pi text/context. |
| [ ] | Reference aliases | M | Next | Frontend/Pi extension configuration. |
| [ ] | Agent mentions | M | Next | pi-subagents-aware extension only. |
| [ ] | MCP resource mentions | L | Later | MCP extension contract. |
| [ ] | Clipboard images | M | Next | Pi prompt image payload. |
| [ ] | Pasted local file attachments | M | Next | MIME/path validation and Pi images/text. |
| [ ] | Large pasted text placeholder | M | Next | Same composer mechanism as large-paste compaction. |
| [ ] | IDE-selected file/ranges | L | Later | Editor bridge extension. |
| [ ] | File frecency ranking | S | Next | Frontend-local persistence. |

### Permissions, questions, and forms

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Generic permission prompt | L | Next | Pi core intentionally lacks permission popups; requires an extension emitting RPC UI requests. |
| [ ] | Allow once/always/reject | M | Next | Extension-owned policy; frontend only renders request. |
| [ ] | Rejection feedback | M | Next | Extension-specific response schema. |
| [ ] | Fullscreen permission diff | M | Next | Extension request plus diff renderer. |
| [ ] | Auto-approve toggle | M | Later | Security-sensitive; never implement silently. |
| [x] | Questions/select/input/editor | L | MVP | Pi RPC extension UI protocol. |
| [ ] | General schema-driven forms | L | Next | Not in Pi RPC core; add only through a versioned extension protocol. |
| [ ] | External-action forms | M | Later | Extension protocol plus opener/clipboard. |
| [ ] | Global/location forms | L | Later | Extension protocol and scope metadata. |

### Status and notifications

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Toasts | S | MVP | Frontend and Pi extension notifications. |
| [x] | Execution/queue status | M | MVP | Pi events/state. |
| [ ] | Desktop notifications | M | Next | Frontend setting or extension. |
| [ ] | Sounds | M | Later | Frontend optional assets/backend. |
| [x] | Child-process failure/reconnect UI | L | MVP | Pi RPC process lifecycle; do not replay uncertain requests automatically. |
| [ ] | Subsystem status dialog | M | Next | Only data Pi/extensions expose. |
| [x] | Error boundary/crash UI | M | MVP | Safe static palette and terminal cleanup. |

### Themes and appearance

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Theme picker/live preview | S | Next | Frontend theme registry. |
| [x] | Basic built-in dark/light themes | M | MVP | Small frontend set; do not copy dozens initially. |
| [ ] | Custom theme discovery | M | Later | Define a frontend schema; optionally translate Pi theme colors. |
| [ ] | System/dark/light mode | M | Next | Terminal palette detection. |
| [ ] | Animations toggle | S | Next | Default animations minimal/off for performance. |
| [ ] | Markdown/grouping/sidebar appearance settings | M | Next | Frontend preferences. |
| [ ] | Diff layout controls | M | Next | Unified default; split only on wide terminals. |
| [ ] | Contextual surface theme tokens | L | Later | Add after basic theme contract stabilizes. |

### Terminal, platform, and accessibility

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [x] | Mouse support | M | MVP | OpenTUI renderer. |
| [x] | Selection/copy-on-select | M | MVP | OpenTUI selection plus clipboard fallback. |
| [ ] | Route/session terminal title | S | Next | One lifecycle owner. |
| [ ] | Ctrl-Z suspend/resume | M | Next | POSIX only; explicit Windows fallback. |
| [ ] | Windows-specific input workarounds | L | Later | Add from real PTY failures, not copied assumptions. |
| [ ] | Kitty enhanced keyboard | M | Next | OpenTUI capability; retain fallback. |
| [x] | Responsive dialogs/layout | M | MVP | 40-column minimum smoke target. |
| [ ] | Semantic UI metadata | M | Next | Use documented OpenTUI semantics. |
| [x] | Keyboard-only operation | M | MVP | Every primary action must have a keyboard path. |
| [ ] | External-link opener/copy fallback | M | Next | Needed for OAuth/docs/forms. |

### Sharing and export

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Share/unshare session | — | No | Placeholder/disabled in OpenCode v2 source; Pi `/share` could be a later explicit command. |
| [x] | Export HTML | M | MVP | Public Pi RPC operation. |
| [ ] | Export/import JSONL | M | Next | Public RPC gap; do not call private SDK modules from the Bun frontend. |
| [x] | Copy transcript/message | S | MVP | Frontend formatter/clipboard. |
| [ ] | Pair device/QR | L | Later | OpenCode service feature; not applicable to local Pi RPC. |
| [ ] | Managed service restart | L | No | Not needed for spawned local Pi; child restart is a different feature. |

### Developer and debug

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Debug info/copy report | S | Later | Include versions, terminal, Pi child, renderer stats; redact paths/secrets. |
| [ ] | OpenTUI debug overlay | S | Later | Development-only switch. |
| [ ] | Runtime console | M | Later | Development-only; never pollute protocol stdout. |
| [ ] | DevTools performance bar | L | Later | Use budgets/instrumentation first. |
| [ ] | Time-to-first-draw diagnostics | S | Later | Benchmark flag. |
| [ ] | Dynamic plugin manager/installer | L | Later | Do not duplicate Pi packages/extensions in v1. |
| [ ] | OpenCode-style plugin routes/slots | L | Later | Prefer Pi extensions plus narrow frontend slots only if requested. |
| [ ] | Scrap/internal screen | — | No | OpenCode development feature. |

### VCS and diff review

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Full-screen diff viewer | L | Next | Frontend Git adapter or Pi extension; not part of core vertical slice. |
| [ ] | Working-tree/base-branch sources | M | Next | Git command adapter. |
| [ ] | Diff file tree | M | Next | UI model after diff backend. |
| [ ] | Hunk/file navigation | M | Next | Diff geometry/index. |
| [ ] | Split/unified/single-patch modes | M | Next | OpenTUI Diff; split multi-file patches first. |
| [ ] | Reviewed-file state | S | Later | Frontend-local viewer state. |

### Alternate Mini TUI

| Pick | Feature | Effort | Proposed | Pi mapping |
|---:|---|:---:|:---:|---|
| [ ] | Separate mini CLI | L | Later | Independent product mode, not a compact responsive layout. |
| [ ] | Scrollback-oriented transcript | L | Later | OpenTUI split-footer/scrollback surface; history becomes less interactive. |
| [ ] | Compact footer panels | L | Later | Only if mini mode is selected. |
| [ ] | Mini permissions/forms | L | Later | Duplicate UI cost; avoid in v1. |
| [ ] | Mini shell/subagent management | L | Later | Backend extension dependencies. |
| [ ] | Mini appearance/replay controls | M | Later | Separate preference surface. |
| [ ] | Shared non-interactive tool formatter | M | Later | Extract only after two real consumers exist. |

## Appendix B: Known OpenCode v2 non-features

Do not assign agents to port these as if they already work upstream:

- sharing/unsharing is placeholder/disabled in the audited v2 source;
- direct next/previous subagent commands report unavailable;
- graphical file editor, embedded terminal panes, and desktop side panels belong to `packages/app`, not `packages/tui`;
- provider inference, model execution, Git rollback, MCP, LSP, and formatter behavior are backend services displayed by the TUI;
- `/init` and arbitrary server commands are server-defined, not implemented by the TUI;
- the Mini TUI is a separate implementation, not merely a responsive main TUI.

## Appendix C: rules for implementation agents

1. Work on one phase/slice at a time and touch only its named files.
2. Read the pinned owner source and the current Pi docs before coding; do not copy private/reconciler internals.
3. Add or update the focused test in the same slice.
4. Keep Pi behavior in the adapter/backend, projections in pure state, and OpenTUI in views.
5. Never make session files or frontend caches a second agent source of truth.
6. Never log secrets, raw auth payloads, full system prompts, or unsanitized user sessions.
7. Never solve performance by dropping events, deleting benchmarks, or enabling permanent redraw.
8. Always clean up subscriptions, timers, child processes, and renderer resources in reverse ownership order.
9. If a required feature is not in Pi RPC, stop and document the missing contract. Do not reach into Pi private `dist/` modules from production code.
10. Preview chezmoi output; do not run a real apply unless the user asks.
