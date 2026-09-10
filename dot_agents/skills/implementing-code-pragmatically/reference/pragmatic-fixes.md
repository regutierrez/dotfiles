# Pragmatic Fixes

Choose a fix only after reproducing the behavior or tracing a reachable failing path, establishing why it violates the contract, and checking whether an earlier boundary already prevents it. If any of those facts is unresolved, name the missing evidence or decision instead of inventing a code change.

## Compare in this order

1. No change when the behavior is correct or the concern is disproved.
2. Delete behavior that is genuinely unnecessary.
3. Correct the source of truth.
4. Reuse an existing owner or mechanism.
5. Make a local fix when the contract is local.
6. Add a compatibility adapter for real consumers that cannot move together.
7. Add an abstraction for demonstrated policy, conversion, variation, shared state, or lifecycle ownership.

Compare new concepts, affected callers, failure modes, proof cost, rollout, and rollback. A larger owner-level correction can be simpler than a small workaround that every caller must understand.

Keep each rule at its owner: upstream parsing errors belong at the data boundary, shared policy at the application owner, and local rendering at the view. A computed fallback or forwarding wrapper that conceals an incorrect source leaves the contract broken.

**Complete when:** the chosen fix enforces the contract across the mapped callers, preserves unrelated behavior, and has a caller-visible acceptance check. Verification and reporting follow the main skill; this reference does not start another review loop.
