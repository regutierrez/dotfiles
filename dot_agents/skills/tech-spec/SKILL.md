---
name: tech-spec
description: Write a language-aware typed call-stack architecture handoff for TypeScript, Python, or mixed systems.
disable-model-invocation: true
---

# Tech Spec

A tech spec is a **typed call-stack architecture handoff**: language-native code-shaped contracts plus execution flows. Prefer precise pseudocode in the affected implementation language over prose wherever precision matters.

This skill is design-only. Do not implement. Save a file only when the user asks for a file; otherwise return the spec inline.

## Language selection

Establish the output language before designing:

1. Inspect the affected files, manifests, framework imports, local instructions, and existing contracts.
2. Select **TypeScript** when the changed system is TypeScript/JavaScript, **Python** when it is Python, and **mixed** when the behavior crosses both runtimes.
3. Follow the repository's supported language version and established libraries. Do not introduce Pydantic, FastAPI, Zod, Effect, dataclasses, or Protocols merely because a profile mentions them.
4. For Python—especially FastAPI/Pydantic systems—read [PYTHON.md](PYTHON.md) and express contracts with Python signatures, Pydantic models, dataclasses, exception families, and Protocols only where each is justified.
5. For TypeScript, use TypeScript types, interfaces, tagged errors, schemas, and function signatures.
6. For mixed systems, show each side in its own language and name the single owner of every cross-runtime schema, invariant, and generated artifact.

Completion criterion: every code block is language-native, and mixed-runtime contracts identify ownership and serialization explicitly.

## Branch selection

1. Use **Path A: Convert context to spec** when the conversation, docs, or codebase already contain enough background to describe the change.
2. Use **Path B: Grill first** when the user wants a new spec but has not provided enough problem, constraints, design direction, affected code, or acceptance criteria.

If a question can be answered by exploring the codebase, inspect the codebase instead of asking.

Completion criterion: the branch is chosen from actual available context; missing architectural decisions are not invented.

## Path A: Convert context to spec

### 1. Load standards and local context

Select the language profile first. Inspect existing code and docs for local vocabulary, module layout, domain concepts, errors, adapters, observability, runtime patterns, and test style. For TypeScript or mixed work, read `../coding-standards/SKILL.md`. For Python work, inspect the actual FastAPI/Pydantic versions and whether the project uses sync or async I/O before sketching contracts. For every language, read `../tdd/SKILL.md` before producing the test plan.

Completion criterion: the spec uses project vocabulary and language-native contracts, and does not introduce a pattern, library, adapter, schema style, or test strategy before checking local precedent.

### 2. Extract the design problem

Capture:

- current state;
- problem;
- users/callers;
- goals;
- non-goals;
- constraints;
- invariants;
- affected systems;
- likely entrypoints;
- operational/runtime concerns;
- risks;
- open questions.

Mark unknowns as open questions instead of filling gaps with plausible design.

Completion criterion: every claimed requirement or constraint is grounded in conversation, code, docs, or an explicit open question.

### 3. Explore design alternatives

Produce materially different alternatives before choosing the recommended design. Alternatives should differ in interface shape, seam placement, ownership, call stack, runtime topology, or module boundaries — not just names.

For each alternative, sketch:

- domain types and state model;
- public/module interfaces and APIs;
- input/output types;
- expected failure types;
- seams, boundaries, and adapters;
- entrypoint-to-side-effect call stack;
- parsing/projection strategy;
- authorization, observability, cancellation, idempotency, and transaction flow when reachable;
- test seam strategy;
- tradeoffs.

Compare alternatives on:

- caller burden;
- module depth and leverage;
- locality of invariants and change;
- seam placement;
- boundary parsing and projections;
- error and cancellation model;
- testability through real seams;
- operational/runtime fit;
- implementation complexity.

Completion criterion: the recommendation is chosen after comparing alternatives, not before.

### 4. Specify the recommended typed contracts

For the recommended design, outline every new, changed, or deleted:

- domain value;
- branded/refined type;
- state machine variant;
- input/output type;
- request/response shape;
- function signature;
- class or module interface;
- expected-failure/custom-error type;
- adapter interface;
- protocol DTO;
- persistence DTO/projection;
- runtime-boundary codec;
- public API.

Name seams, adapters, implementations, ownership boundaries, and what crosses each boundary. State what each layer may know and what must not leak across the seam.

Render each contract in the selected language:

- **TypeScript:** types, interfaces, schemas, tagged errors, and function signatures.
- **Python:** Pydantic boundary models, dataclasses or ordinary typed classes for internal values when appropriate, explicit function signatures, typed exception families, and `Protocol` only for a real swappable or external seam.
- **Mixed:** paired language-native contracts plus the serialization format and source of truth that keeps them aligned.

Completion criterion: every new or changed boundary has a concrete language-native contract/API sketch, or an explicit reason no new contract is needed.

### 5. Specify call stacks and data flow

For every new, changed, or deleted behavior, show the call stack from entrypoint to side effects and response.

Include type/data flow:

```txt
raw input
  -> boundary model / unknown
  -> parser or validator
  -> canonical domain/application input
  -> service/module contract
  -> adapter or repository call
  -> typed result/error
  -> response projection
  -> serialized output
```

Include current vs proposed flow when changing existing behavior. Include failure, retry, cancellation, transactionality, idempotency, observability, authorization, and runtime-hop flow when reachable.

Completion criterion: every affected behavior has an end-to-end call stack and type/data-flow trace.

### 6. Map files and modules

List:

- files/modules to add;
- files/modules to change;
- files/modules to delete, if any;
- test files;
- config/migration/runtime files, if any.

For each file, state the contract, code path, boundary, adapter, domain concept, or test responsibility it owns.

Completion criterion: every contract and call-stack step maps to a file/module or an open question.

### 7. Write the RGR TDD test plan

Use the sibling TDD workflow and testing standards. Plan vertical Red-Green-Refactor slices: one failing behavior test, minimal implementation, repeat. Do not write a horizontal "all tests first, all code later" plan.

Favor behavior through public interfaces and real seams over implementation-coupled mocks. In FastAPI systems, prefer HTTP-level tests through `httpx.AsyncClient`/`ASGITransport` when the project is async, and replace external boundaries through FastAPI dependency overrides or existing production seams rather than monkeypatching internals.

Cover proportionately:

- happy paths;
- failure paths;
- parser rejection and accepted shapes;
- domain invariants and state transitions;
- adapter contracts;
- persistence/runtime semantics;
- cancellation/retry/idempotency paths;
- observability and safe summaries where relevant;
- end-to-end flows for high-consequence behavior.

Completion criterion: every public behavior, invariant, important failure path, changed boundary, and changed seam has a red test slice or an explicit reason not to test it.

### 8. Produce the spec

Return the spec inline unless the user requested a file path. If a file was requested, save it there.

Do not implement and do not ask to implement by default.

Completion criterion: the output follows the outline below and is implementation-ready for another engineer.

## Path B: Grill first

1. Do not write a full spec yet.
   - State that there is not enough context for an implementation-ready tech spec.
   - Completion criterion: the agent has not invented requirements, APIs, files, or call stacks.
2. Start a grilling interview.
   - Use `../grill-with-docs/` when the user wants docs, ADRs, glossary/domain language, or durable design artifacts created during discovery.
   - Otherwise use `../grill-me/`.
   - Ask one question at a time and provide the recommended answer with each question.
   - If a question can be answered by exploring the codebase, inspect the codebase instead of asking.
   - Completion criterion: the interview has enough context for Path A: problem, users/callers, constraints, affected systems, desired behavior, boundaries, likely APIs, invariants, risks, and acceptance tests.
3. Convert to the spec.
   - Once grilling context is sufficient, run Path A.
   - Completion criterion: the final artifact is a typed call-stack architecture handoff, not interview notes.

## Required spec outline

Use this shape unless the task is tiny enough to compress without losing contracts or call stacks:

```md
# <Title>

## Summary

## Context / Current State

## Goals

## Non-Goals

## Invariants

## Design Constraints

## Alternatives Considered

### Option 1: <name>

### Option 2: <name>

### Option 3: <name>

## Recommendation

## Proposed Design

## Domain Model and Language-Native Types

## Contracts, Interfaces, and APIs

## Seams, Boundaries, Adapters, and Implementations

## Call Stacks and Data Flow

### Current / Old Flow

### Proposed / New Flow

### Failure Flow

### Retry / Cancellation / Idempotency Flow

### Observability Flow

## Files to Add / Change / Delete

## RGR TDD Test Plan

## Risks and Open Questions
```

Omit sections that truly do not apply, but do not omit typed contracts, seams, call stacks, or tests merely because they are hard to specify.

## Writing rules

- Code first: language-native pseudocode defines contracts, APIs, and data flow. Never express a Python design in TypeScript merely because the original skill did.
- Prose explains why; language-native contracts and call stacks define what changes.
- Focus on types, interfaces, APIs, inputs/outputs, seams, boundaries, adapters, domain modules, service modules, external adapters, and call stacks.
- Prefer precise domain values over strings, booleans, nullable bags, and loosely shaped objects.
- Keep seams real: adapters translate framework, persistence, network, time, randomness, telemetry, runtime, or platform boundaries.
- Avoid speculative abstraction; every seam earns its existence through invariants, locality, leverage, testing, or a real boundary.
- Keep a single source of truth; do not restate the same rule in multiple sections unless one section points to the other.
- Unknowns stay open questions. Do not invent product requirements, domain rules, APIs, or call stacks to make the spec feel complete.
