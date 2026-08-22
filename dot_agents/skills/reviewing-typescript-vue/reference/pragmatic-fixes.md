# Pragmatic Fixes

A pragmatic fix solves a verified problem at the place that owns it. It preserves nearby behavior and adds no needless concepts.

## Check that the problem should exist

Ask in order:

1. Can you reproduce the behavior or trace a reachable path?
2. Is it wrong under the product, domain, accessibility, or compatibility rule?
3. Do TypeScript, a runtime schema, Vue, the router, or an earlier boundary already prevent it?
4. Can the behavior be deleted instead of repaired?
5. Where can the invariant be enforced once for every affected path?
6. Does the repository already have a fitting mechanism?
7. Must old and new consumers work at the same time?
8. What is the cheapest proof that could show the fix is wrong?

If the first two answers are no, do not invent a code change. Report the evidence or decision still needed.

## Map blast radius and proof

```diagram
+----------+     +-------------+     +-------------+     +-----------+
| Runtime  | --> | Owner       | --> | Callers and | --> | User or   |
| input    |     | enforces    |     | consumers   |     | contract  |
+----------+     +-------------+     +-------------+     +-----------+
                       |
                       v
                +-------------+
                | Proof       |
                | checks path |
                +-------------+
```

Blast radius means everything a change can affect. Check only what applies.

| Area | Ask |
| --- | --- |
| Invariant | What must hold? What breaks it now? |
| Owner | Where can the invariant be enforced once? |
| Callers | Which components, composables, stores, routes, packages, or external consumers rely on current behavior? |
| Runtime data | Are API values, route input, storage, events, SSR state, or generated clients affected? |
| Vue behavior | Do props, emits, reactivity, rendering, lifecycle, routing, or accessibility change? |
| Async work | Do cancellation, stale results, retries, cleanup, ordering, or shutdown change? |
| Compatibility | Do exports, types, defaults, errors, payloads, URLs, DOM, or stored values change? |
| Operations | Do build output, deploy order, SSR, logging, monitoring, or rollback change? |
| Proof | Which focused test and configured checks prove the behavior? |

A local pure function may need one caller and one test. Shared state, public packages, routes, SSR, accessibility, or async ownership need a wider map.

## Find the owner

```diagram
+----------+     +-------------+     +-------------+     +----------+
| External | --> | Boundary    | --> | Application | --> | Vue view |
| value    |     | parses      |     | rule        |     | renders  |
+----------+     +-------------+     +------+------+     +----------+
                                        |
                                        v
                                 +-------------+
                                 | Store, API, |
                                 | or browser  |
                                 +-------------+
```

The owner is the narrowest place with enough context and authority to enforce the invariant for every affected path.

Do not:

- hide bad API or store data in a template fallback;
- repeat the same parsing or policy in many components;
- make every component cancel work that one composable owns;
- mutate a prop because the symptom appears in the child;
- wrap a source-of-truth error with another computed value;
- move a local concern into a global store without shared ownership;
- put server authorization in a client route guard.

## Choose in this order

1. no change;
2. delete needless behavior;
3. fix the source of truth;
4. reuse an existing owner or mechanism;
5. make a local fix when the problem is truly local;
6. add a compatibility adapter for consumers that cannot move together;
7. add an abstraction only for real policy, conversion, shared state, runtime variation, or lifecycle ownership.

Compare new concepts, affected callers, failure modes, compatibility, proof cost, and rollback. A slightly larger owner-level fix is simpler than a tiny workaround every caller must understand.

## Prove and stop

1. Show the original failure or behavior.
2. Exercise the fixed caller-visible path.
3. Cover relevant invalid input, error, cancellation, cleanup, accessibility, or compatibility behavior.
4. Run the changed package's configured lint and type checks.
5. Recheck mapped consumers.
6. Run broader tests or builds only when the invariant crosses those boundaries.

Do not prove only mock call order when output, DOM, emitted events, state, navigation, errors, cleanup, or public types can prove the contract.

Stop when the owner enforces the invariant, affected contracts are safe, focused checks pass, and no new surface remains unchecked. Do not continue into nearby cleanup.
