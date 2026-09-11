# Shared-Gate Contracts

A shared gate accepts, rejects, filters, normalizes, binds, serializes, authorizes, retries, persists, or executes values for multiple callers. Its contract includes every caller and every copy of a value, not only the gate's local input and output.

Distinguish original, validation, transformed, stored, rebound, regenerated, and execution copies. A validation transform may make one copy safe while leaving another unchanged.

Check both directions:

- **False acceptance:** invalid, undeclared, malformed, or unauthorized input disappears from validation, survives elsewhere, or is accepted incorrectly.
- **False rejection:** legitimate declared, deferred, framework-owned, or runtime-bound input is rejected before its owner handles it.

A weakness that fails closed is a robustness gain, not a defect. Rank it that way.

For symbolic keys, distinguish a producer that emits a key before the gate from an insertion after the gate. A downstream binder proves consumption, not insertion timing. Compare retry feedback with producer requirements: regeneration is unsatisfiable only when no output can satisfy both contracts.

Implementation must preserve each distinct caller contract and prove compatibility through a caller-visible check. Review must independently inventory callers, copies, exact keys where relevant, both failure directions, and retry compatibility. The active workflow owns the procedure.
