# Evidence Base

This policy combines the repository-owned installation model from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) with recurring practices in mature Python projects.

See [examples.md](examples.md) for concrete source locations and the limits of each example.

## Comparison corpus

- [Django](https://github.com/django/django): staged normalization and validation, precise exceptions, and tested failure contracts.
- [pytest](https://github.com/pytest-dev/pytest): localized typing escapes, narrow patch lifetimes, and broad catches only at diagnostic containment boundaries.
- [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy): typed public APIs around dynamic internals, explicit coercion, domain exceptions, and exception-safe cleanup.
- [Trio](https://github.com/python-trio/trio): lexical task ownership, cancellation-safe resource handling, and documented low-level invariants.
- [attrs](https://github.com/python-attrs/attrs): declarative validation, small behavioral objects, and explicit failure contracts.
- [HTTPX](https://github.com/encode/httpx): strict typing, constructor validation, intentional exception taxonomy, and lexical client ownership.
- [Hypothesis](https://github.com/HypothesisWorks/hypothesis): centralized boundary validation, narrow exception translation, and reliable cleanup.
- [Click](https://github.com/pallets/click): precise overloads, narrow casts at dynamic framework seams, and context-managed temporary state.

## Practices supported across the corpus

### Preserve type evidence

Strong projects use strict or substantial type checking while retaining narrow escapes at genuinely dynamic seams. `Any`, casts, and ignores are not categorically wrong. They become harmful when they spread into ordinary internal code, replace feasible narrowing, or hide an unstated runtime assumption.

### Validate at boundaries

External values are normalized and validated near entry points. Trusted internal code then carries meaningful values rather than repeatedly inspecting raw dictionaries. Normalization, type validation, semantic validation, and execution may be separate steps when each has real substance.

### Give failures a contract

Expected failures are caught narrowly. Broad catches appear at explicit containment boundaries such as test reporting, cleanup, telemetry isolation, or runtime supervision. Exception translation adds context or protects an abstraction; it does not erase the cause without reason.

### Make ownership visible

Resources and asynchronous work have an obvious owner and closure path. Context managers, structured concurrency, and `try`/`finally` make cleanup survive exceptions and cancellation.

### Test behavior and failure

Tests cover invalid inputs, exception behavior, cleanup, and post-close states. Patches are scoped and reversible. Dynamic calls with intentionally invalid types are appropriate when testing runtime validation.

### Isolate necessary dynamism

Metaclasses, descriptors, decorators, import hooks, generated APIs, and dynamic attributes can be the correct design. Mature projects concentrate them at framework seams instead of letting incidental dynamism spread through ordinary logic.

### Explain constraints, not syntax

Useful explanations record ownership, compatibility, invariants, or surprising constraints. They do not narrate obvious code.

## Do not universalize project constraints

- Django's validation hooks are not a universal application architecture.
- pytest's import hooks and broad diagnostic catches are test-runner requirements.
- SQLAlchemy's instrumentation, casts, and adapter layers are ORM requirements.
- Trio's `BaseException` handling belongs to cancellation and runtime machinery.
- attrs code generation and stub complexity are library-defining features.
- HTTPX's transport layering and exception taxonomy are protocol concerns.
- Hypothesis shrinking and deferred validation are engine concerns.
- Click's decorator mutation and `SystemExit` handling are CLI concerns.

The generic policy therefore bans very little by syntax alone. It requires evidence, clear ownership, and a concrete alternative.

## Tool boundary

- Ruff owns established syntax, bug, async, test, and suppression checks.
- Basedpyright or the repository's established checker owns semantic type analysis.
- Nested casts and other runtime-identity questions remain review concerns when the type checker cannot prove them.
- Agent review owns architecture, boundary quality, behavioral tests, and whether a dynamic seam is justified.
