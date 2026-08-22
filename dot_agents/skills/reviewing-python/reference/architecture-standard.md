# Python Architecture

Fit the repository's design. Do not force a standard folder layout or vocabulary.

## Start with the contract

Define caller-visible behavior first:

1. accepted input and conversion to one format;
2. output, writes, and external actions;
3. expected failures and what callers should do;
4. required dependencies;
5. resource lifetime;
6. compatibility needs.

Use the simplest Python form that makes the contract clear: a function, dataclass, model, protocol, context manager, exception, or established convention.

## Put behavior with its owner

```diagram
                         +------------------+
                         | Composition root |
                         | builds + closes  |
                         +---------+--------+
                                   |
                                   v
+----------+     +---------+     +-------------+     +---------+
| External | --> | Inbound | --> | Application | --> | Domain  |
| input    |     | adapter |     | policy      |     | rules   |
+----------+     +---------+     +------+------+     +---------+
                                      |
                                      v
                               +----------+     +-------------+
                               | Outbound | --> | Database or |
                               | adapter  |     | provider    |
                               +----------+     +-------------+
```

The diagram shows behavior flow, not required folders or import direction.

- **Domain:** business rules and valid state changes.
- **Application:** use-case order, authorization policy, and transactions.
- **Adapter:** framework, protocol, database, provider, and data conversion.
- **Composition root:** startup code that builds dependencies and owns shutdown.

Keep code together when it changes for the same reason. Split it only when the parts have different owners.

Keep framework and provider objects inside adapters when a smaller value or interface will do. Normal imports should not start services or create live resources.

## Prefer deep modules

A deep module hides real work behind a small interface. It may enforce a rule, convert a protocol, or own a resource.

Use the deletion test:

- If deletion removes concepts and makes callers clearer, the module was likely needless forwarding.
- If deletion spreads policy, conversion, or cleanup into callers, the module is useful.

Add an abstraction only when it hides real complexity, owns policy or lifetime, supports real variation, or gives callers a stable boundary. Do not extract code only because it is long or repeated once.

## Validate where trust changes

Validate data when it enters trusted code from HTTP, queues, databases, caches, files, environment, SDKs, CLIs, or generated output.

Check what applies:

- shape and types;
- business rules across fields;
- normalization;
- authorization and tenant ownership;
- size and count limits;
- data-version compatibility.

Validate before side effects when practical. Internal code should not repeat checks already guaranteed at the boundary. Put authorization where the needed object and actor context exist.

## Make failures useful

An expected failure should tell the caller whether to retry, reject, deny, report conflict, degrade, or stop.

Convert dependency errors once in the adapter that owns that dependency. Keep useful causes, but do not leak secrets or provider details.

Catch broad exceptions only where code is meant to absorb failure: cleanup, telemetry, optional cache behavior, job supervision, or top-level reporting. The fallback must be deliberate and observable when needed.

## Make lifetime clear

For every client, session, file, stream, cursor, task, executor, cache, or subscription, answer:

- who creates it;
- who closes or cancels it;
- what happens on error, cancellation, and partial startup;
- whether ownership can move;
- whether reuse or double-close is valid.

Prefer context managers and task groups. A factory that returns a live resource must make cleanup clear. Background work needs an owner for errors and shutdown.

## Preserve public behavior

Check imports, signatures, defaults, sync or async behavior, exceptions, stored values, schemas, events, generated clients, and startup side effects.

Preserve the contract, update all consumers, add an adapter, run a migration, or declare the break. Do not rely on accidental compatibility.

## Test the real contract

Test output, state, failure, and cleanup through the nearest stable interface. Use supported framework test hooks and fakes for external systems.

Narrow patching is fine for clocks, randomness, environment, process state, framework registration, or unavoidable globals.

Ask both:

1. Does the code follow the repository's design?
2. Does it meet the actual behavior requirement?

One does not prove the other.

## Reject rigid rules

Do not require a fixed adapter count, result values for every failure, end-to-end tests for every function, a ban on all patching, wrappers for every identifier, one symbol per file, or a framework-specific layout.

A general rule needs evidence, a clear benefit, and practical exceptions.
