# TypeScript Contracts

Use TypeScript to describe known contracts. Use runtime code to establish facts that types cannot prove.

## Keep runtime boundaries honest

```diagram
+-------------+     +----------------+     +----------------+
| Unknown or  | --> | Parser or      | --> | Trusted owner  |
| external    |     | runtime schema |     | uses one type  |
+-------------+     +----------------+     +----------------+
```

Treat HTTP responses, JSON, route input, storage, messages, environment, generated output, DOM data, and third-party values as less trusted until the owning boundary checks them.

- Prefer the repository's existing parser or schema library.
- Convert to one useful internal representation.
- Keep `unknown` at the boundary when the value is not established yet.
- Do not use `any`, assertions, or a generic return type as a substitute for runtime proof.
- Do not repeat parsing after a stronger boundary guarantees the same path.

An assertion may describe a fact TypeScript cannot derive, but it performs no runtime check. Verify the fact independently and keep the assertion narrow. A non-null assertion has the same burden.

## Model valid states directly

```diagram
+--------+     +---------+     +---------+
| Idle   | --> | Loading | --> | Success |
+--------+     +----+----+     +---------+
                  |
                  v
              +--------+
              | Failed |
              +--------+
```

Use discriminated unions when variants carry different data or permit different operations. Prefer one valid state over several booleans and optional fields that allow impossible combinations.

Use `never` exhaustiveness checks when every closed variant must be handled and future variants must force a decision. Do not treat an external protocol as closed unless the boundary defines an unknown-variant policy.

Use ordinary primitives for ordinary values. Add branded or opaque values only when interchangeable values create a real bug risk and the repository already supports the pattern.

## Keep types as narrow as the facts

- Let inference preserve known literal and object information.
- Use `satisfies` when checking a contract without replacing a value's useful inferred type.
- Avoid widening a known value and casting it back later.
- Use a named owner contract when callers share a real API.
- Avoid generic parameters used by one concrete call shape.
- Prefer readonly inputs when the function does not own mutation.
- Copy before sorting, reversing, splicing, or otherwise mutating caller-owned arrays and objects.

Enable or preserve strict checks according to repository policy. `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess` expose useful classes of mistakes, but adding them to an existing project is a tooling migration with its own blast radius, not a side effect of a local fix.

Treat absent properties and explicit `undefined` as different when runtime behavior distinguishes them. Preserve valid falsey values; do not replace `0`, `false`, or an empty string with a fallback merely because `||` treats them as falsey.

## Make async work owned

```diagram
+--------+     +---------+     +-----------+
| Caller | --> | Promise | --> | Await or  |
| starts |     | work    |     | supervise |
+--------+     +----+----+     +-----------+
                  |
                  v
             +----------+
             | Failure  |
             | observed |
             +----------+
```

- Await or deliberately supervise every promise.
- Keep rejection handling with the owner that can decide whether to retry, render, report, or stop.
- Pass an `AbortSignal` when the dependency supports cancellation and the caller owns the lifetime.
- Bound retries and repeat only operations that are safe to repeat.
- Prevent older work from overwriting newer state.
- Do not use `forEach` with an async callback when completion or failure matters.

Detached work is valid only when a named owner observes errors and controls lifetime.

## Make failures useful

```diagram
+----------+     +----------------+     +----------------+
| Raw error| --> | Dependency     | --> | Expected caller|
| or throw |     | owner classifies|    | response       |
+----------+     +----------------+     +----------------+
```

Use the repository's existing error convention. A discriminated result, thrown error, rejected promise, framework error, or store state can all be correct when callers understand it.

Do not require a custom result type for every failure. Do not silently turn malformed data or failed work into ordinary absence. Preserve safe context and causes where the error convention supports them.

Catch values are not guaranteed to be `Error`. Narrow them before reading fields. Never expose secrets, tokens, raw responses, or private data in errors and logs.

## Protect public contracts

Review changes to:

- exported functions, values, types, overloads, and declaration output;
- package exports and type-versus-value imports;
- defaults, optionality, and sync-versus-async behavior;
- runtime schemas, serialized values, events, and generated clients;
- errors and side effects callers observe.

TypeScript compatibility is structural and directional. A compiling producer does not prove every consumer remains compatible. Use explicit exported return types when the repository treats inferred output as a public API or declaration stability matters; do not annotate every local function by rule.

## Keep tooling in its lane

Compiler and linter output is deterministic evidence, not a complete design review.

Use configured checks. Do not install stricter options, rewrite types, suppress diagnostics, add unsafe casts, or change public annotations merely to manufacture a green command.

`install-anti-slop` owns installation and migration of the personal Oxlint plugin. This skill owns whether a reported diagnostic reveals a real contract problem and what the smallest coherent fix is.
