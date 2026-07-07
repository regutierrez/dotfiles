# TypeScript standards (frontend, web backend, shared packages)

## Organizing modules

- No barrel files (an `index.ts` that re-exports everything) in feature folders; import directly from the file you need.
- The web backend's shared types package is the single home for types used by both the frontend and backend. It never imports Vue — write local mapped types instead. The frontend imports these types and never re-declares them.
- One plain-logic module per job, with its test next to it. Pull plain logic into its own module and test it through its exports; never export something only so a test can reach it.

## Types

- Every domain shape is a Zod schema + inferred type pair:
  ```ts
  export const FooSchema = z.object({ ... });
  export type Foo = z.infer<typeof FooSchema>;
  ```
- **Schema changes without migrations** (a repo constraint, not a preference — stored documents are never migrated): new fields get `.default()`/`.optional()` so older stored documents still parse, always with a comment naming which old data the default protects.
- `as const` arrays for field lists that drive runtime behavior.
- Zero `any`. Use `unknown` at edges plus check functions (`isFoo(value: unknown): value is Foo`). Narrow what a function accepts with `Pick<T, ...>`. Casts are rare and get a `SAFETY:` comment saying why the cast is safe.
- `catch (err)` gives you `unknown`; check what it is before reading fields like `message`.
- Keep generics simple — `fetch<T>(path, body?)` — no type gymnastics.
- Avoid call sites like `run(true, false)`. Use named options or small state types so the call site says what the values mean.
- Be careful when spreading objects with optional fields; `{ ...old, name: maybeName }` can erase a value with `undefined`. Build output objects on purpose.

## Errors

- A typed error class carrying useful details, plus a matching check function (`isFooError`), plus an exported user-message constant — with a doc comment stating where it's thrown and where it's caught ("Thrown from X; caught at the Y mutation boundary, which shows a toast").
- `.parse` where bad data means a bug; `.safeParse` on paths that must survive bad data (stored or old documents). Server errors are `TRPCError` with the right code.
- When code carries on after a failure, it falls back to a safe default **with a logged warning and a why-comment** naming what would break otherwise.

## API and frontend patterns

- Options objects with defaults; pass `AbortSignal` through where a call can genuinely be cancelled: `options: { signal?: AbortSignal } = {}`.
- Composables take one typed inputs object and return one typed result object (`UseXInputs` / `UseXReturn`), accept `Ref`/`ComputedRef` inputs, and return `ComputedRef`s.
- Stores come from factories (`createXStore(options)`) where one method owns each shared job — for example, exactly one method invalidates the cache, and callers never coordinate that themselves.
- TanStack vue-query for server state; dedicated modules for query keys and cache updates. No pinia/vuex.
- Prefer allow-lists over block-lists, pinned by a guard test (`Object.keys(Schema.shape).sort()` against a literal) so any schema change forces someone to look.
- Every promise is owned: `await` it, `return` it, collect it with `Promise.all` / `Promise.allSettled`, or hand it to a clear background-work helper. No floating promises.
- `Promise.all` is fine for small fixed lists. For user-sized or data-sized lists, use a limit so one request doesn't launch hundreds of calls.
- Plain promises; `Promise.allSettled` when some calls may fail and that's acceptable. No Effect/fp-ts here.

## State and data safety

- If an object moves through states, model the allowed states clearly. Don't use random booleans to mean lifecycle steps.
- Don't log secrets, raw user data, request bodies, tokens, or full provider payloads. Log safe summaries that help debug without leaking private data.

## Comments

Why-comments, dense where the tricky rules live: ticket IDs, evidence, incident references, why the number handling is safe, lock ordering, mirrors of the Python backend. Numeric separators for big numbers (`48_000_000`). Full policy in [COMMENTS.md](COMMENTS.md).

## Test style

- Vitest, tests next to the code. Builder helpers with overrides: `buildCurve(overrides: Partial<ReachCurve> = {})`.
- Fake only truly external things, with a comment saying why. Avoid broad `vi.mock` calls; if you must mock a whole module, it should be a true external and there should be no better boundary.
- Test names explain the reason, not the mechanics ("ignores derived fields so harmless re-stamps don't trip the guard").
- Cover edge cases where the domain demands it: floating-point jitter, order changes, null-to-present transitions.
