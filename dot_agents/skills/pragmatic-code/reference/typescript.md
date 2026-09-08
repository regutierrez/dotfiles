# TypeScript and JavaScript Contracts

Use static types to describe known contracts and runtime code to establish facts types cannot prove. For JavaScript, apply the runtime guidance and the project's existing JSDoc or checking conventions; adding TypeScript is a separate change.

## Runtime facts and type precision

Treat JSON, HTTP, storage, environment, generated clients, messages, and third-party values as unestablished until the owning boundary parses them. Prefer its existing parser or schema. Keep `unknown` at that boundary; `any`, assertions, and a generic return type are not runtime validation.

An assertion can describe a fact TypeScript cannot derive. Establish that fact independently and keep the assertion narrow. A non-null assertion has the same burden. Catch values are not guaranteed to be `Error`; narrow before reading fields.

- Preserve useful literal and object inference; avoid widening known facts and casting them back later.
- Use `satisfies` when checking a contract without replacing useful inference.
- Name shared caller contracts; add generic parameters only for actual variation.
- Prefer readonly inputs when mutation belongs to the caller. Copy before sorting, reversing, splicing, or mutating caller-owned collections.
- Distinguish absent properties from explicit `undefined` when runtime behavior does.
- Preserve valid falsey values: `0`, `false`, and empty strings are not automatically missing.
- Investigate unchecked indexing, optionality, overloads, and schema drift against real inputs, not just a clean compilation.

## Valid states

Use discriminated unions when states carry different data or permit different operations. They can replace booleans and optional fields that allow impossible combinations.

Use `never` exhaustiveness checks for closed variants when adding a variant must force a decision. External protocols are not closed unless the boundary defines unknown-variant handling. Ordinary values can stay primitives; branded or opaque values need real interchangeability risk and a supported repository pattern.

## Promises and cancellation

Await or deliberately supervise each promise. The owner must observe rejection and control lifetime. An async `forEach` callback does not make the surrounding operation await completion or handle its failure.

Pass `AbortSignal` when the dependency supports cancellation and the caller owns lifetime. When work cannot abort, guard against stale completion changing newer state. Check retry bounds and repeat safety using the application's actual constraints.

Use the repository's error convention: a result, thrown error, rejected promise, framework error, or state variant can be valid. Do not impose a result type on every failure. A fallback must not turn malformed data or failed work into ordinary absence.

## Public types and runtime compatibility

Check exported values, types, overloads, declaration output, package entry points, type-versus-value imports, defaults, and sync/async behavior alongside runtime schemas, generated clients, events, errors, and stored values.

Structural compatibility is directional. A compiling producer does not establish compatibility for every consumer. Explicit exported return types help when inferred output is part of a public API or declaration stability matters; local functions do not all need annotations.

## Configured checks

Use the installed TypeScript version and configured compiler, lint, test, and build commands. Preserve existing strict checks. Enabling `strict`, `exactOptionalPropertyTypes`, or `noUncheckedIndexedAccess` is a tooling migration, not an incidental fix.

Consume already-configured anti-slop diagnostics as repository policy, not universal defects. `install-anti-slop` owns plugin installation, configuration, and migration; locate it through the harness's skill discovery and load it only for an explicit tooling request. Use its discovered location rather than assuming sibling directories. Keep checks intact rather than adding unsafe casts or suppressions to force a pass.
