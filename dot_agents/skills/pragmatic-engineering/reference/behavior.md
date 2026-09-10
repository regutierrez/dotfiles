# Behavioral Contracts

Use the affected path to select concerns below. Investigate concerns; there is no finding quota. Language and framework references add mechanics rather than another full review.

| Concern | Evidence to establish |
| --- | --- |
| Contract | Accepted inputs, invalid states, defaults, outputs, errors, and observed effects agree with actual callers. Static types, runtime schemas, and generated contracts describe the same behavior. |
| Trust | HTTP, queues, files, storage, environment, SDKs, CLI, messages, and generated input cross a boundary that checks relevant shape, business rules, normalization, authorization, size, and data version. Outbound and previously stored values need scrutiny too. |
| Ownership | Policy, conversion, shared state, resources, and effects have an owner. If that design changes, apply [ownership.md](ownership.md) rather than judging by file length or wrapper count. |
| Failures | Errors preserve useful safe causes and allow a deliberate caller response. Check false absence, lost errors, unowned retries, partial failure, and success-only cleanup. |
| Lifetime | Trace creation, success, failure, cancellation, ownership transfer, partial startup, shutdown, double-close, and use-after-close where reachable. Async spelling is not proof that execution yields. |
| Compatibility | Inspect imports/exports, signatures, defaults, sync/async use, errors, stored values, events, schemas, generated clients, startup effects, and deployed consumers. Preserve behavior, update real consumers, adapt, migrate, or explicitly declare a break. |
| Operations | Check deployment order, rollback, telemetry, redelivery, transaction boundaries, and isolation between concurrent processes or worktrees when the changed behavior relies on them. |

## State and observable outcomes

When behavior depends on readiness, status, selection, or asynchronous completion, trace meaningful transitional and terminal states against every reachable trigger and producer representation. Derive representations from production payloads and schemas rather than tests alone: numeric IDs, numeric strings, opaque IDs, nulls, legacy forms, and discriminated variants may take different branches. Include automatic producers, user actions, polling, callbacks, retries, and resumed work. State written after a guarded effect may be too late for a consumer that re-reads persisted data.

For each caller or trigger, compare the state at gate entry—not only eventual state—with the expected result and downstream effect. Inventory rows need explicit base/head behavior and a defect, no-defect, missing-proof, or decision disposition.

Map observable consumers separately. A history card, selected detail view, persisted diagnostic, stream message, default selection, and subsequent request context may read different copies. Trace each relevant status or diagnostic field from its producer through persistence or transport, schema/serialization, query result, and renderer. Preventing navigation or selection must not make the only useful failure explanation or recovery action inaccessible. Equivalent data stored elsewhere is not equivalent behavior unless the remaining surface renders that field or an intentionally equivalent fallback.

Judge equivalence on the same reachable user path. A diagnostic available only after navigating to another route, restoring cleared context, or relying on a different optional stream does not preserve the blocked surface's behavior. Once producer, transport, old renderer, new block, and absence of a same-path fallback are established, the presentation loss is proven rather than merely missing a UI test.

Before calling loss permanent, account for terminal-state events, polling, watchers, rendered child components, emitted events, and retry owners. For reactive races, establish ordering through framework semantics or a focused test rather than choosing a possible interleaving. Distinguish temporary degradation, eventual recovery, and terminal loss.

## Security

For authorization, tenancy, SQL, URLs, files, templates, prompts, generated content, serialization, secrets, and alternate entry points, trace the actor and access, source, crossed boundary or missing control, reachable sink, and concrete harm. Check bypass routes as well as the intended API. A security slogan without that path is not a finding.

Do not emit secrets or unapproved personal data through logs, traces, metrics, errors, or other diagnostics. Preserve minimization and redaction when data crosses diagnostic boundaries; use the repository's established representation rather than imposing a universal wrapper type.

## Bounded work

Use workload evidence when input size, concurrency, retries, queues, datasets, reactive updates, or generated output can grow work. Check limits, backoff, idempotency, pools, pages, batches, buffers, streaming, event-loop progress, and fan-out as relevant.

Caching, memoization, virtualization, batching, concurrency, and harder algorithms need measured or clearly reachable workload justification. A cache also needs ownership, lifetime, a size policy, and invalidation. Use actual operational constraints rather than inventing timeout or size thresholds.

Keep database transactions shorter than network calls or other long-running work unless atomic ownership requires otherwise. Use an ordinary call for in-process work, a transaction for one database's atomic state, and a durable workflow when coordination must survive process failure. Put idempotency at the owner that can observe and suppress duplicate effects.

## Caller-visible proof

Select the cheapest test that can falsify the contract. Cover meaningful success, invalid input, denial, dependency failure, retry, cancellation, cleanup, shutdown, and compatibility paths. Output, state, error, public types, and cleanup usually prove more than mock call order alone. Each branch or function does not need its own test by default.

When event-loop responsiveness matters, deliberately block downstream work and check that an independent heartbeat, probe, or coroutine still progresses. Timing-only assertions and `async` declarations do not establish this.

For a shared gate or transformation, apply [shared-gate contracts](shared-gates.md). Missing compatibility evidence remains explicit even when one confirmed defect has already been found.

This is technical guidance, not an execution checklist. The active implementation or review skill owns scope, completeness, and reporting.
