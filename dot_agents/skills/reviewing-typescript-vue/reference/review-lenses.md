# TypeScript and Vue Review Lenses

Use only lenses that fit the changed behavior. Investigate each concern before reporting it. Do not create one finding per lens.

```diagram
+---------+     +---------+     +-----------+
| Change  | --> | Relevant| --> | Evidence  |
| path    |     | lenses  |     | or omit   |
+---------+     +---------+     +-----------+
```

## 1. Types and runtime contracts

Check whether callers, tools, and runtime code agree.

Investigate assertions, non-null assertions, `any`, broad generics, unchecked indexing, widened known values, mismatched optionality, type-only imports, declaration output, and schema drift.

These are leads, not automatic findings. Check parsing, generated types, framework guarantees, and actual callers first.

## 2. Ownership and module depth

Find the narrowest owner of policy, conversion, shared state, async work, and cleanup.

Challenge forwarding wrappers, one-use generic factories, components that only relay props, composables that only rename one call, global stores for local state, and split operations callers must reassemble.

Keep an abstraction when deletion would spread meaningful complexity. Do not judge by file length alone.

## 3. Vue state and component contracts

Check props, events, slots, local versus shared state, lost reactivity, impure computed values, unnecessary mirrored state, deep watchers, stale async completion, store hydration, route reuse, and component cleanup.

Verify the installed Vue, Router, and Pinia versions before claiming framework behavior.

## 4. Async work and errors

Check unawaited promises, swallowed rejection, request races, cancellation, retry bounds, repeat safety, watcher invalidation, unmount behavior, partial startup, and detached work without supervision.

An expected error should let the caller or user retry, reject, deny, navigate, degrade, or stop. Check whether a boundary already translates the failure before reporting raw dependency errors.

## 5. Public compatibility

Check exports, types, defaults, overloads, package entry points, runtime schemas, generated clients, events, props, composable and store returns, routes, URLs, stored values, DOM behavior, errors, and sync-versus-async use.

Preserve the behavior, update all consumers, add an adapter, migrate data, or declare the break. Do not protect hypothetical consumers.

## 6. Accessibility

Use this lens when structure, content, forms, interaction, focus, navigation, timing, or feedback changes.

Check semantics, accessible names, keyboard operation, focus order and restoration, error association, announcements, contrast when styles are in scope, reduced motion when animation changes, and browser-level behavior.

A finding needs a reachable user path and concrete barrier. Automated output alone remains a diagnostic until confirmed.

## 7. Security and runtime trust

Use this lens for authorization, tenancy, raw HTML, dynamic URLs, redirects, files, browser storage, messages, SSR state, serialization, secrets, and server endpoints.

A security finding needs an actor, reachable source, crossed boundary or missing guard, sink, and concrete harm.

Vue text interpolation escapes content by default. Investigate `v-html`, direct DOM APIs, dangerous URL contexts, and state serialized into HTML. Client route guards and hidden UI are not server authorization.

## 8. Tests

Require the cheapest test that proves the invariant and meaningful failure paths.

Prefer stable interfaces: output, DOM, emitted events, state, navigation, errors, cleanup, public types, and generated contracts. Focused dependency replacement is valid at a real boundary. Do not require a test for every branch, function, or lens.

## 9. Bounded work and performance

Use this lens only when work grows with input, reactive updates, concurrency, retries, queues, payloads, DOM size, or generated output.

Check timeouts, retry limits, request deduplication only when required, watcher breadth, event-listener growth, page and batch limits, cache ownership, buffer limits, render frequency, and one action starting too much work.

Do not recommend caching, memoization, virtualization, batching, lazy loading, concurrency, or a harder algorithm without measured or clearly reachable workload evidence. Every cache also needs a lifetime, size limit, and invalidation rule.

## 10. SSR and hydration

Use this lens only when the application renders outside the browser or hydrates server output.

Check request-scoped state, browser globals, deterministic output, safe state transfer, lifecycle assumptions, route readiness, store hydration, HTML validity, and mismatch handling.

Do not add SSR complexity to a client-only path.

## Finish

1. Run configured narrow checks.
2. Confirm or disprove each concern.
3. Use [finding-contract.md](finding-contract.md) for supported findings.
4. Keep diagnostics separate.
5. Recheck surfaces opened by the fix.
6. Stop when the invariant and affected behavior are proven.
