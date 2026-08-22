# Python Review Lenses

Use only the lenses that fit the changed behavior. Investigate each concern before reporting it. Do not create one finding per lens.

## 1. Types and contracts

Ask whether callers and tools can understand the real contract.

Check for:

- `Any`, casts, reflection, or ignores spreading through internal code;
- types wider than values the program already knows;
- invalid constructor combinations fixed later;
- protocols or overloads for call patterns that do not exist;
- output that breaks a declared response, event, or stored shape.

Prefer ordinary types and let the type checker infer what it can. Use advanced typing tools only when they describe a real contract. Keep needed dynamic behavior at the external-system boundary.

## 2. Input and output boundaries

At HTTP, queue, database, cache, file, environment, SDK, CLI, and generated-output boundaries, check:

- shape, types, and business rules;
- conversion to one consistent form;
- authorization and tenant ownership;
- size and count limits;
- generated and outbound values;
- stored data returning to trusted code.

Do not repeat validation already guaranteed on every path by a stronger boundary.

## 3. Failures

Every expected failure should help the caller retry, reject, deny, report conflict, degrade, or stop.

Check for:

- broad catches outside a place meant to absorb failure;
- defaults that turn broken data into valid absence;
- provider errors escaping the boundary that owns them;
- lost causes or useful context;
- retries without limits, ownership, or idempotency (safe repetition);
- secrets in logs or errors;
- cleanup that runs only on success.

Broad catches are fine at deliberate cleanup, telemetry, optional cache, supervisor, and top-level reporting points.

## 4. Resource and task ownership

For each client, session, file, stream, cursor, task, executor, cache, or subscription, find who owns it.

Check error, cancellation, partial startup, shutdown, blocking work in async code, ownership transfer, double-close, and use-after-close.

Prefer context managers and task groups. A live resource returned by a factory needs a clear cleanup contract.

## 5. Abstractions

Keep an abstraction when it owns real variation, policy, lifetime, an external boundary, or a useful place to test behavior.

Challenge forwarding wrappers, one-path factories, generic setup for one case, split-up operations, duplicate layers, and compatibility code with no real target. Use the deletion test. Do not judge by line count.

## 6. Tests

Cover the behaviors that matter:

- success;
- invalid input;
- denial or tenant mismatch;
- dependency failure, timeout, and retry;
- partial failure, cleanup, cancellation, and shutdown;
- compatibility and invalid states.

Prefer stable public interfaces, supported framework test hooks, and fakes for external systems. Narrow patching is fine for clocks, randomness, environment, process state, registration, or unavoidable globals.

Do not require a test for every branch or function. Require the cheapest test that proves the rule and meaningful failures. A test of mock call order alone is weak when output, state, error, or cleanup can prove behavior.

## 7. Compatibility

Check imports, signatures, defaults, sync or async use, exceptions, stored values, schemas, events, generated clients, and startup side effects.

Preserve the behavior, update all consumers, add a compatibility layer, migrate the data, or declare the break. Do not protect hypothetical consumers.

## 8. Security

Use this lens for authorization, tenancy, SQL, outbound URLs, files, templates, prompts, generated content, serialization, secrets, and bypass routes.

A security finding needs:

- an actor and their access;
- a reachable path;
- the missing or bypassed control;
- concrete harm.

Check alternate paths, not only the intended API. Do not report a slogan without a path and impact.

## 9. Bounded work

Use this lens when work grows with input, concurrency, retries, queues, datasets, or generated output.

Check timeouts, retry limits, delay between retries, idempotency, queue and pool limits, batches, pages, caches, buffers, streaming, event-loop blocking, and one action starting too many operations.

Do not recommend caching, batching, concurrency, or a harder algorithm without workload evidence. A cache also needs an owner, a size limit, and an invalidation rule.

## Finish

1. Run configured checks.
2. Confirm or disprove each concern.
3. Use [finding-contract.md](finding-contract.md) for supported findings.
4. Recheck surfaces opened by the fix.
5. Stop when the rule and affected behavior are proven.
