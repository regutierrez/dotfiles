# TypeScript and Vue Architecture

Fit the repository's design. Do not force a folder layout, layer count, suffix, state library, or vocabulary.

## Start with the contract

Define caller-visible behavior first:

1. accepted input and runtime conversion;
2. output, rendering, emitted events, writes, and external actions;
3. expected failures and what callers or users should do;
4. required dependencies;
5. async and resource lifetime;
6. public type and runtime compatibility;
7. accessibility behavior when the user interface changes.

Use the simplest form that makes the contract clear: a function, component, composable, store, schema, discriminated union, service, or established repository convention.

## Put behavior with its owner

```diagram
                         +------------------+
                         | App entry        |
                         | builds + mounts  |
                         +---------+--------+
                                   |
                                   v
+----------+     +----------+     +-------------+     +-----------+
| Runtime  | --> | Boundary | --> | App policy  | --> | Component |
| input    |     | parses   |     | or store    |     | renders   |
+----------+     +----------+     +------+------+     +-----------+
                                      |
                                      v
                               +-------------+
                               | API, browser|
                               | or platform |
                               +-------------+
```

The diagram shows responsibilities, not required folders or imports.

- **Boundary:** parses protocol, API, storage, route, environment, and generated values.
- **Application owner:** enforces domain policy, sequences work, and owns shared state when needed.
- **Vue owner:** renders, accepts props, emits intent, and owns local interaction state.
- **App entry:** creates global dependencies and owns application-wide startup and shutdown.

Keep code together when it changes for the same reason. Split it only when the parts have different owners.

Keep framework, transport, and vendor objects near their boundary when ordinary values would make inner code clearer. Imports should not start requests, listeners, timers, or mutable singletons unless the framework requires and owns that behavior.

## Prefer deep modules

A deep module hides meaningful work behind a small interface. It may enforce a rule, parse a protocol, coordinate a request, own shared state, or pair setup with cleanup.

Use the deletion test:

- If deletion removes concepts and makes callers clearer, the module was probably needless forwarding.
- If deletion spreads policy, conversion, async coordination, or cleanup into callers, the module is useful.

Add an abstraction only when it hides real complexity, owns policy or lifecycle, supports real runtime variation, or gives callers a stable boundary. Do not extract code only because it is long, repeated once, or might be reused later.

A component or composable may be useful for one caller when it owns a coherent visual or stateful concern. Reuse is evidence, not a prerequisite. A generic abstraction still needs more than one concrete behavior or a stable external boundary.

## Parse where trust changes

Parse values that enter trusted code from HTTP, RPC, generated clients, route params, query strings, storage, messages, environment, DOM attributes, SSR payloads, and third-party SDKs.

Check what applies:

- shape and primitive types;
- business rules across fields;
- normalization and units;
- authorization and tenant ownership on the server;
- size and count limits;
- data-version compatibility.

TypeScript annotations and assertions do not validate runtime values. Parse once at the narrowest reliable boundary. Internal code should not repeat guarantees already established on every path.

## Make errors useful

```diagram
+------------+     +----------------+     +----------------+
| Dependency | --> | Owning boundary| --> | Caller or user |
| fails      |     | translates     |     | can respond    |
+------------+     +----------------+     +----------------+
```

An expected failure should tell the caller whether to retry, reject, deny, show a message, navigate, degrade, or stop.

Translate provider and protocol failures at the boundary that owns the dependency. Preserve useful causes and safe context without leaking secrets or raw provider details.

Catch broadly only where code deliberately absorbs failure: cleanup, telemetry, optional behavior, task supervision, route-level reporting, or an application error boundary. A fallback must be truthful and observable when needed.

## Make lifecycle and async ownership clear

```diagram
+-----------+     +----------------+     +-----------------+
| Owner     | --> | Request, watch,| --> | Abort, stop, or |
| starts    |     | timer, listener|     | remove          |
+-----------+     +----------------+     +-----------------+
```

For each request, promise, watcher, subscription, timer, listener, observer, worker, stream, cache, or client, answer:

- who starts it;
- who handles success and failure;
- who aborts, stops, removes, or closes it;
- what happens when input changes, a component unmounts, navigation changes, or startup partially fails;
- whether late results can overwrite newer state;
- whether ownership can move.

Keep setup and cleanup together. Use the repository's cancellation mechanism. Do not add cancellation that the dependency cannot honor; when work cannot be aborted, prevent stale completion from changing current state.

## Preserve public behavior

Check exported values and types, declaration output, package entry points, component props and events, composable and store returns, routes and URLs, runtime schemas, stored values, generated clients, errors, DOM behavior, and SSR output.

Preserve the contract, update every consumer, add an adapter, migrate data, or declare the break. Do not protect hypothetical consumers, but do not assume TypeScript structural compatibility proves runtime compatibility.

## Test the real contract

Test output, DOM, state, emitted events, navigation, failure, and cleanup through the nearest stable interface. Use supported Vue and repository test helpers. Replace external systems at a real boundary when practical.

Focused module replacement can be pragmatic at a hard framework or platform seam. Do not create production wrappers solely to satisfy a test.

Ask both:

1. Does the code fit the repository's design?
2. Does it meet the actual behavior requirement?

One does not prove the other.

## Reject rigid rules

Do not require a fixed folder tree, adapter count, component size, one symbol per file, composable for every component, store for every shared value, result type for every failure, end-to-end test for every function, ban on all mocks, documentation on every export, or wrapper around every platform API.

A general rule needs a reachable failure, evidence from the language or framework, practical exceptions, and a cheaper alternative when one exists.
