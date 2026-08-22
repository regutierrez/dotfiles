# Source Examples

Use these sources to understand a pattern before turning it into policy. A repository's local convention is not evidence of a universal rule.

## Django

[Form fields](https://github.com/django/django/blob/main/django/forms/fields.py) stage conversion, validation, validator execution, and structured error aggregation. [HTTP utilities](https://github.com/django/django/blob/main/django/utils/http.py) reject invalid values early with precise exceptions.

Use Django as evidence for boundary pipelines and tested failure contracts. Do not require Django's form hooks or largely unannotated compatibility style elsewhere.

## pytest

[Configuration entry points](https://github.com/pytest-dev/pytest/blob/main/src/_pytest/config/__init__.py) normalize accepted input shapes and reject unsupported ones at the boundary. [`saferepr`](https://github.com/pytest-dev/pytest/blob/main/src/_pytest/_io/saferepr.py) catches broad failures at a deliberate diagnostic containment boundary.

Use pytest as evidence that broad catches need a named containment purpose. Do not generalize its import hooks, AST rewriting, plugin dynamism, or frequent narrow patching to ordinary application code.

## SQLAlchemy

[URL coercion](https://github.com/sqlalchemy/sqlalchemy/blob/main/lib/sqlalchemy/engine/url.py) validates accepted public forms and raises a domain-specific argument error. [Engine defaults](https://github.com/sqlalchemy/sqlalchemy/blob/main/lib/sqlalchemy/engine/default.py) use exception-safe cursor cleanup.

Use SQLAlchemy as evidence for explicit coercion, error vocabularies, adapters, and resource closure. Do not generalize ORM instrumentation, metaclasses, generated code, or its volume of casts.

## Trio

[TCP connection setup](https://github.com/python-trio/trio/blob/main/src/trio/_highlevel_open_tcp_stream.py) tracks resource ownership across competing connection attempts and translates low-level errors with context. [Subprocess handling](https://github.com/python-trio/trio/blob/main/src/trio/_subprocess.py) protects cleanup under cancellation.

Use Trio as evidence for lexical task ownership and cancellation-safe cleanup. Do not generalize runtime-level `BaseException` handling to normal business logic.

## attrs

[Validators](https://github.com/python-attrs/attrs/blob/main/src/attr/validators.py) combine declarative field validation, small callable objects, meaningful representations, and documented failure modes.

Use attrs as evidence for precise validation contracts. Do not require code generation, stubs, or a callable-object pattern when a function is simpler.

## HTTPX

[Configuration objects](https://github.com/encode/httpx/blob/master/httpx/_config.py) reject contradictory argument combinations during construction. [Exceptions](https://github.com/encode/httpx/blob/master/httpx/_exceptions.py) define layered public failures, while clients make sync and async resource ownership explicit.

Use HTTPX as evidence for strict typing, constructor invariants, and context-managed ownership. Do not require a large exception hierarchy in a small package.

## Hypothesis

[Internal validation](https://github.com/HypothesisWorks/hypothesis/blob/master/hypothesis/src/hypothesis/internal/validation.py) separates type checks, conversion, bounds, and semantic invariants while preserving expected causes.

Use Hypothesis as evidence for centralized validation and narrow exception translation. Do not generalize deferred validation, shrinking, or engine sentinels.

## Click

[Parameter types](https://github.com/pallets/click/blob/main/src/click/types.py) use overloads to describe conversion semantics and attach failures to command context. [Testing utilities](https://github.com/pallets/click/blob/main/src/click/testing.py) use context managers to own temporary I/O and process state.

Use Click as evidence for precise public typing and temporary-state ownership. Do not generalize decorator mutation, command registration, or `SystemExit` handling.

## Cross-check before adding a rule

A generic rule needs support from at least three independent repositories or a direct language-level correctness argument. Record:

1. the behavior being prevented;
2. representative positive and negative examples;
3. existing Ruff and type-checker coverage;
4. legitimate exceptions;
5. expected false positives;
6. why agent judgment is insufficient;
7. focused tests for the rule and its exceptions.
