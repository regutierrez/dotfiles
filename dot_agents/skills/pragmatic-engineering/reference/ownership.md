# Ownership and Boundaries

Use the repository's simplest form that expresses the contract: a function, class, module, or existing framework mechanism. Responsibilities below describe ownership, not a required folder tree or layer count.

## Put behavior with its owner

```diagram
+----------+     +---------------+     +-----------------+
| External | --> | Input adapter | --> | Application     |
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

For deep-module vocabulary, interface design, seam placement, and the deletion test, load `codebase-design`. This reference does not duplicate those rules.

## Trust and failure edges

Parse less-trusted values into one useful internal representation at the narrowest reliable boundary. Validate before effects where practical. Internal code can rely on guarantees actually established on every path. Put authorization where the actor and object context exist.

Translate provider failures at the dependency's owner. Preserve useful causes and safe context. Expected failures should tell callers whether to retry, reject, deny, report conflict, degrade, or stop. A deliberate cleanup, telemetry, optional-cache, supervisor, or top-level reporting boundary may catch broadly; its fallback must remain truthful and observable when needed.

Use established error conventions. A custom result type for every failure, a wrapper for every identifier, export documentation everywhere, and a ban on all patching are not universal architecture requirements. Explicit project policy still applies.

## Lifecycle contracts

For each live resource or task, identify its creator, error observer, cancellation/cleanup owner, and behavior on partial startup and shutdown. Make transfer, reuse, double-close, and stale completion semantics explicit where reachable. Factories returning live resources must expose who closes them.

## Test seams

Callers and tests should exercise behavior through the nearest stable interface. Prefer supported framework test hooks and real or faithful external implementations. Narrow patching is valid for clocks, randomness, environment, process state, registration, or unavoidable platform seams. Production wrappers should earn their place beyond accommodating a mock.

Architecture fit and correctness to requirements are separate questions; evidence for one does not establish the other.
