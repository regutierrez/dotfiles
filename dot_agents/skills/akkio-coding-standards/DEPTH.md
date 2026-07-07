# Where code should live

## Grow a module before adding a new one

Before adding behavior, ask whether an existing strong module should absorb it. Growing a good module beats creating a new thin one. When you do create a module, design it to be deep: a small entry surface (one entry point, typed request/response) that hides real work — provider zoos, retries, data cleanup, cache coordination, parallel fan-out.

## Which layer owns a rule

The stack is Vue frontend → web backend (tRPC) → ML server (FastAPI) → data warehouses. The recurring failure is one rule smeared across layers — some checking in the frontend, a bit in the rpc handler, a bit in the Python backend. Rules:

- **One layer owns each rule; the other layers stay thin.** Decide the owner before writing code: UI concerns in the frontend, saving and consistency in the rpc layer, data/ML meaning in the Python backend.
- **A rule both sides need is written once**, in the shared types package, and imported by both sides. Never re-implement the same check on both sides.
- **Python↔TypeScript pairs that can't share code** get a comment on each side pointing at the other, plus a test on the TypeScript side that pins the shape — so when one side changes, a test fails instead of the two sides quietly drifting apart.

## Logic in the middle, effects at the edge

Separate deciding from doing:

- Plain builder and data-cleanup functions hold all the logic and return a result — easy to test, no fakes needed.
- Side effects (rpc mutations, toasts, database writes, LLM calls) live in a thin outer layer that calls the plain functions and turns their typed errors into user-facing behavior.

When one function both computes and performs effects, split it: the plain part is where the tests, the reuse, and the value are.

## Common excuses, and why they don't fly

- **"I'll add a helper to utils.py / utils.ts."** A utils file is a junk drawer — shallow by construction. Find the module whose job this really is, or create a module named after the job.
- **"A wrapper class per provider/datasource is architecture."** A class that forwards every call adds nothing; a wrapper earns its place only when it hides a real difference behind a shared interface.
- **"The frontend needs its own copy of this type/check."** Import it from the shared types package. A copy will drift out of sync — a bug scheduled for later.
