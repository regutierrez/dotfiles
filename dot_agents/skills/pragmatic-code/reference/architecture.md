# Contract-First Architecture

Use the repository's simplest form that expresses the contract: a function, class, module, component, or existing framework mechanism. Responsibilities below describe ownership, not a required folder tree or layer count.

## Put behavior with its owner

```diagram
+----------+     +---------------+     +-----------------+
| External | --> | Boundary      | --> | Application     |
| input    |     | parses        |     | sequences work  |
+----------+     +---------------+     +--------+--------+
                                              |
                                   +----------+----------+
                                   |                     |
                                   v                     v
                            +-------------+      +---------------+
                            | Domain rule |      | Adapter       |
                            | computes    |      | owns protocol |
                            +-------------+      +---------------+
```

Keep domain rules and valid state transitions together. Application owners coordinate effects, authorization policy, and transactions. Adapters own framework/provider objects and conversions. Composition roots build dependencies and own startup and shutdown. Keep vendor details near their boundary when ordinary values give callers a smaller contract.

Co-locate behavior that changes for the same reason. Normal imports should not start live resources or mutable singletons unless an established framework explicitly owns that lifetime.

## Deep modules and the deletion test

A deep module hides meaningful work behind a small caller-facing interface. Imagine deleting it:

- if concepts disappear and callers become clearer, it was likely needless forwarding;
- if policy, conversion, coordination, or cleanup spreads into callers, it earns its place.

Real policy, resource ownership, runtime variation, and stable external boundaries can justify an abstraction. Reuse is evidence, not a prerequisite. A generic abstraction needs concrete variation or a stable external contract, not a possible future use.

Choose neither extraction nor deletion from line count, a fixed adapter count, naming suffixes, or a quota of layers. Internal seams can stay private even when tests use them. Keep each new concept only when a simpler existing owner or direct implementation cannot express its responsibility as clearly.

## Trust and failure boundaries

Parse less-trusted values into one useful internal representation at the narrowest reliable boundary. Validate before effects where practical. Internal code can rely on guarantees actually established on every path. Put authorization where the actor and object context exist.

Translate provider failures at the dependency's owner. Preserve useful causes and safe context. Expected failures should tell callers whether to retry, reject, deny, report conflict, degrade, or stop. A deliberate cleanup, telemetry, optional-cache, supervisor, or top-level reporting boundary may catch broadly; its fallback must remain truthful and observable when needed.

Use established error conventions. A custom result type for every failure, a wrapper for every identifier, export documentation everywhere, and a ban on all patching are not universal architecture requirements. Explicit project policy still applies.

## Lifecycle contracts

For each live resource or task, identify its creator, error observer, cancellation/cleanup owner, and behavior on partial startup and shutdown. Make transfer, reuse, double-close, and stale completion semantics explicit where reachable. Factories returning live resources must expose who closes them.

## Test seams

Callers and tests should exercise behavior through the nearest stable interface. Prefer supported framework test hooks and real or faithful external implementations. Narrow patching is valid for clocks, randomness, environment, process state, registration, or unavoidable platform seams. Production wrappers should earn their place beyond accommodating a mock.

Architecture fit and correctness to requirements are separate questions; evidence for one does not establish the other.
