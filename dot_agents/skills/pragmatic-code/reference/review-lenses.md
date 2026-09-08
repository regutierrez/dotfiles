# Behavior Checks

Use the affected path to select concerns below. Investigate concerns; there is no finding quota. Language and framework references add mechanics rather than another full review.

| Concern | Evidence to establish |
| --- | --- |
| Contract | Accepted inputs, invalid states, defaults, outputs, errors, and observed effects agree with actual callers. Static types, runtime schemas, and generated contracts describe the same behavior. |
| Trust | HTTP, queues, files, storage, environment, SDKs, CLI, messages, and generated input cross a boundary that checks relevant shape, business rules, normalization, authorization, size, and data version. Outbound and previously stored values need scrutiny too. |
| Ownership | Policy, conversion, shared state, resources, and effects have an owner. If that design changes, apply [architecture.md](architecture.md) rather than judging by file length or wrapper count. |
| Failures | Errors preserve useful safe causes and allow a deliberate caller response. Check false absence, lost errors, unowned retries, partial failure, and success-only cleanup. |
| Lifetime | Trace creation, success, failure, cancellation, ownership transfer, partial startup, shutdown, double-close, and use-after-close where reachable. Async spelling is not proof that execution yields. |
| Compatibility | Inspect imports/exports, signatures, defaults, sync/async use, errors, stored values, events, schemas, generated clients, startup effects, and deployed consumers. Preserve behavior, update real consumers, adapt, migrate, or explicitly declare a break. |
| Operations | Check deployment order, rollback, telemetry, redelivery, transaction boundaries, and isolation between concurrent processes or worktrees when the changed behavior relies on them. |

## Security

For authorization, tenancy, SQL, URLs, files, templates, prompts, generated content, serialization, secrets, and alternate entry points, trace the actor and access, source, crossed boundary or missing control, reachable sink, and concrete harm. Check bypass routes as well as the intended API. A security slogan without that path is not a finding.

## Bounded work

Use workload evidence when input size, concurrency, retries, queues, datasets, reactive updates, or generated output can grow work. Check limits, backoff, idempotency, pools, pages, batches, buffers, streaming, event-loop progress, and fan-out as relevant.

Caching, memoization, virtualization, batching, concurrency, and harder algorithms need measured or clearly reachable workload justification. A cache also needs ownership, lifetime, a size policy, and invalidation. Use actual operational constraints rather than inventing timeout or size thresholds.

## Caller-visible proof

Select the cheapest test that can falsify the contract. Cover meaningful success, invalid input, denial, dependency failure, retry, cancellation, cleanup, shutdown, and compatibility paths. Output, state, error, public types, and cleanup usually prove more than mock call order alone. Each branch or function does not need its own test by default.

When event-loop responsiveness matters, deliberately block downstream work and check that an independent heartbeat, probe, or coroutine still progresses. Timing-only assertions and `async` declarations do not establish this.

For a shared gate or transformation, complete [shared-gates.md](shared-gates.md) before claiming caller safety. Missing compatibility evidence remains explicit even when one confirmed defect has already been found.

**Complete when:** every applicable concern is confirmed, disproved, or named as unresolved; meaningful failure and consumer coverage is accounted for. Use the finding contract for accepted findings, not this checklist as an output template.
