# Seven Review Lenses

Use every lens, but report only issues supported by the code path under review.

## 1. Type evidence

Block when an escape hides information the program already has or asserts an invariant that no runtime operation established.

Look for:

- `Any` propagating from one internal layer to another;
- nested or unrelated casts;
- ignores without a specific diagnostic code;
- broad callback signatures where a protocol or generic captures the contract;
- annotations widened before a later cast;
- dynamic attribute access replacing an ordinary typed interface.

Prefer inference, generics, overloads, `Protocol`, `TypedDict`, `TypeGuard` or `TypeIs`, and validated constructors. Allow narrow adapters for untyped dependencies, plugin systems, serialization, and intentionally schema-less passthrough data when the boundary and reason are explicit.

## 2. Boundary models

Block when untrusted dictionary data crosses multiple layers while downstream code assumes keys or value types that were never validated.

Look for:

- decoded JSON passed directly into domain or persistence logic;
- repeated `isinstance`, key-presence, or fallback checks for the same payload;
- `dict[str, Any]` used as a stable business object;
- contradictory constructor options accepted and handled later;
- validation scattered after side effects begin.

Prefer validation at HTTP, queue, file, CLI, database, and third-party SDK boundaries. Use a model, dataclass, `TypedDict`, protocol, or explicit parser according to runtime needs. Allow isolated proxy and passthrough payloads that are not inspected internally.

## 3. Failure handling

Block when expected and unexpected failures are conflated or when failure becomes a silent default.

Look for:

- bare catches or `except Exception` without containment-boundary behavior;
- `BaseException` outside cancellation, runtime, or finalization code;
- fallback values that make corruption look like valid absence;
- retries without ownership, limits, or preserved causes;
- exception translation that loses useful context;
- cleanup that runs only on the success path.

Prefer the narrowest expected exception, explicit fallback contracts, preserved causes, and `finally` or context managers. Broad catches are valid at telemetry, cleanup, cache, reporting, and supervisor boundaries when the fallback is deliberate and observable.

## 4. Testing and mocking

Block when a test patches private implementation details and verifies call choreography instead of externally meaningful behavior, and a stable boundary is available.

Look for:

- patch targets containing private symbols;
- tests that break after harmless internal rearrangement;
- several mocks reproducing the implementation under test;
- assertions only about call order or counts where outputs or state express the contract;
- global patches that outlive a test;
- missing tests for failure, cleanup, or invalid inputs.

Prefer boundary fakes, injected collaborators, temporary resources, and observable outcomes. Allow narrow patches for clocks, randomness, process state, environment, network clients, and framework registration when those are the real boundary.

## 5. Unnecessary abstraction

Block when removing an abstraction makes ownership and behavior clearer without creating meaningful duplication.

Look for:

- one-use wrappers that only forward arguments;
- factories that always construct one concrete implementation;
- compatibility layers with no supported compatibility target;
- helper modules that split one coherent operation across files;
- registries used where direct calls are sufficient;
- generic configuration added for a single fixed case.

Keep abstractions that define a stable boundary, isolate a dependency, support multiple real implementations, own lifecycle, or make testing materially clearer. Do not use line counts alone as evidence.

## 6. Async work and resource ownership

Block when blocking work runs in an async path without deliberate offloading, or when the creator of a resource has no obvious closure path.

Look for:

- synchronous HTTP, process, sleep, file, or path calls under `async def`;
- clients, sessions, cursors, files, streams, tasks, and executors without lexical ownership;
- background tasks whose errors and cancellation have no owner;
- cleanup that cancellation can interrupt;
- hidden transfer of resource ownership.

Prefer async-native APIs, deliberate thread or process offloading, context managers, structured concurrency, and explicit ownership transfer. Allow synchronous adapters and worker activities when they do not execute on an event-loop path.

## 7. Impossible-state defenses

Block when a default, guard, or catch hides a state that the owning contract says cannot occur.

Look for:

- `None` fallbacks after construction guarantees a value;
- repeated type checks after boundary validation;
- empty collection defaults that turn missing required data into valid data;
- branches a type checker proves unreachable;
- catches for exceptions the called contract cannot raise;
- production `assert` used to validate user, configuration, or persisted data.

Prefer fixing the contract or validating once at its boundary. An internal assertion is acceptable when it documents a real invariant and correctness does not depend on the assertion running under optimized Python.

## Severity test

A judgment-based finding is blocking only when all are true:

1. The current code creates a concrete correctness, maintenance, or test-reliability risk.
2. The relevant contract or ownership boundary is visible in the reviewed code path.
3. A simpler alternative can be named precisely.
4. The alternative preserves intended behavior.

Otherwise present the observation as a question or omit it.

## Review output

Order findings by impact. For each finding include the path and line, behavior at risk, evidence, and concrete alternative. Separate automated diagnostics from judgment-based findings. End with remaining uncertainty and the exact checks run.
