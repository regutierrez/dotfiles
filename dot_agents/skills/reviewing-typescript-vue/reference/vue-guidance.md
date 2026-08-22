# Vue Guidance

Follow the repository's Vue version and conventions. Check installed APIs before relying on version-specific behavior.

## Put state and effects with their owner

```diagram
+-----------+     +-------------+     +--------------+
| Component | --> | Composable  | --> | API or       |
| view/local|     | stateful work|    | browser      |
+-----------+     +-------------+     +--------------+
      |
      v
+-----------+
| Store     |
| shared app|
+-----------+
```

- A component owns rendering and local interaction state.
- A composable owns a coherent stateful concern and the effects it starts. Reuse is helpful but not required.
- A store owns application-shared or domain state, not every value used by two components.
- An API or platform boundary owns protocol conversion and dependency-specific errors.

Keep state local until another owner truly needs it. Module-scope reactive state is a singleton; use it only when that lifetime is intended. In SSR, application and store state must be request-owned.

Prefer a small returned interface. A composable may return refs in a plain object when callers need to destructure without losing reactivity. Do not add a composable that only renames one call and owns no state, policy, conversion, or cleanup.

## Keep props and events explicit

- Declare props and emitted events with names and payloads callers can understand.
- Treat props as readonly inputs.
- Emit intent to the owner instead of mutating parent-owned data.
- Use local state for an intentionally independent initial value.
- Use computed state for a transformed prop.
- Mutate nested prop data only when that tight coupling is deliberate and established locally.
- Remember component events reach the direct parent; they do not bubble through the tree.

Type-only declarations do not validate runtime data from external systems. Runtime prop validation and application boundary parsing solve different problems.

Check the installed Vue version before using reactive props destructuring, named tuple emits, inferred template refs, lazy hydration, or other version-sensitive features.

## Derive instead of synchronize

```diagram
+--------------+     +----------------+     +----------+
| Source state | --> | Pure computed  | --> | Template |
+--------------+     +----------------+     +----------+
       |
       v
+----------------+
| Watcher owns   |
| side effect    |
+----------------+
```

- Use computed values for pure derived state.
- Treat computed results as readonly snapshots; update the source instead.
- Use watchers for side effects, not for copying one reactive value into another without need.
- Use `watch` when the source and trigger must be explicit.
- Use `watchEffect` when synchronously read dependencies naturally define the effect.
- Avoid deep watchers over large structures unless nested mutation is the actual contract.

Use `ref` as the usual choice for replaceable values and values crossing composable boundaries. Use `reactive` when object identity and proxy-style mutation make the owner clearer. Do not destructure reactive objects or stores in ways that lose reactivity; use the repository's established helpers such as `storeToRefs` when applicable.

Do not pass a current primitive value when a watcher or composable needs a reactive source. Pass a ref or getter. Remember that `watchEffect` tracks only values read before its first `await`.

## Own lifecycle and cancellation

```diagram
+-------------+     +------------------+     +----------------+
| Setup owner | --> | Watch, request,  | --> | Invalidate,    |
| starts      |     | listener, timer  |     | abort, remove  |
+-------------+     +------------------+     +----------------+
```

- Register lifecycle hooks and component-owned watchers synchronously during setup.
- Pair listeners, timers, observers, subscriptions, and third-party resources with cleanup.
- Register watcher invalidation to abort stale requests or dispose prior work.
- Use post-flush timing only when the effect must inspect updated DOM.
- Stop asynchronously created watchers manually because Vue cannot attach them to the component lifetime automatically.
- When work cannot be aborted, guard current state from stale completion.

Vue stops synchronously created watchers on unmount. It does not automatically remove arbitrary browser or library resources.

## Make routing and data loading deliberate

```diagram
+----------+     +----------------+     +----------------+
| Route    | --> | Param/query    | --> | Data owner     |
| changes  |     | owner watches  |     | loads or reuses|
+----------+     +----------------+     +----------------+
```

- Watch the specific route param or query value that drives behavior, not the whole route object.
- Account for reused route components: a param change may not remount the component.
- Put leave and update policy in the nearest suitable component or router guard.
- Keep server authorization on the server; client guards only control client navigation.
- Choose before-navigation or after-navigation loading from the desired user experience. Neither is universally correct.
- Show truthful loading, empty, and error behavior.
- Cancel or supersede stale loads when route input changes.
- Use async components for render-triggered code splitting, not as a general data layer.

Do not invent generic caching, retry, prefetch, or loader machinery without repository precedent and workload evidence.

## Use stores for shared ownership

- Use Pinia only when the repository uses it.
- Give each store one coherent shared responsibility.
- In setup stores, return state that Pinia must hydrate, inspect, or extend.
- Keep router and injected infrastructure from becoming store-owned state merely because a store can access them.
- Use `storeToRefs` or the local equivalent when destructuring reactive state and getters.
- Give tests a fresh store instance unless shared state is the behavior under test.

One store per file is a useful Pinia recommendation, not a universal semantic requirement. Option stores and setup stores are both supported; follow local needs.

## Preserve accessibility

Check accessibility whenever rendered structure or interaction changes.

- Prefer semantic HTML and native controls.
- Preserve labels, accessible names, heading order, landmarks, keyboard use, and focus behavior.
- Give buttons an explicit type when form submission is not intended.
- Associate instructions and errors with their controls.
- Do not hide focusable content from assistive technology.
- Use stable unique IDs in reusable components.
- After client-side navigation, update title, announcements, or focus when the application's policy requires it.

Normal text interpolation is escaped by Vue. Raw HTML, dynamic URLs, direct DOM APIs, and serialized state need context-specific review. Automated accessibility checks are diagnostics, not proof of the full user experience.

## Apply SSR and hydration rules only when relevant

```diagram
+-------------+     +----------------+     +----------------+
| Server app  | --> | HTML + state   | --> | Client app     |
| per request |     | safe transfer  |     | hydrates same  |
+-------------+     +----------------+     +----------------+
```

For SSR, SSG, Nuxt, or hydration-sensitive work:

- create app, router, and stores per request;
- keep universal code free of unguarded browser globals;
- move browser-only effects to client lifecycle;
- make server and client output deterministic;
- serialize and escape state safely;
- hydrate state before consumers run;
- fix mismatches instead of suppressing avoidable ones.

Mounted and unmounted hooks do not run during server rendering. Do not create server-side resources in setup expecting an unmount hook to clean them up.

Skip this lens for a client-only application when the changed path cannot render on a server.

## Test stable behavior

- Test rendered output, props, slots, emitted events, user interactions, navigation, store behavior, errors, and cleanup.
- Drive components through public interactions instead of private methods.
- Await Vue updates and pending promises when the test helper requires it.
- Test pure or reactivity-only composables directly.
- Host lifecycle or injection-dependent composables in a component and unmount it when cleanup matters.
- Use a focused router mock for component policy or a fresh real router for integration behavior.
- Understand whether store actions are stubbed before trusting a component test.
- Use browser or end-to-end tests when layout, native browser behavior, routing deployment, hydration, or accessibility needs a real browser.

Snapshots may support a test, but they should not replace intentional assertions about the invariant.
