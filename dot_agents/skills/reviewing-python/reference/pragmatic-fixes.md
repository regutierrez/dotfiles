# Pragmatic Fixes

A pragmatic fix solves a verified problem at the place that owns it. It preserves nearby behavior and adds no needless concepts.

## Check that the problem should exist

Ask in order:

1. Can you reproduce or verify the behavior?
2. Is it wrong under the product or domain rule?
3. Can the behavior be deleted instead of repaired?
4. Where can the rule be enforced once for every affected path?
5. Does the repository already have a fitting mechanism?
6. Must old and new callers work at the same time?
7. What is the cheapest proof that could show the fix is wrong?

If the first two answers are no, do not invent a code change. Report the evidence or decision still needed.

## Map blast radius and proof

Blast radius means everything the change can affect. Check only what applies.

| Area | Ask |
| --- | --- |
| Rule | What must hold? What breaks it now? |
| Owner | Where can the rule be enforced once? |
| Callers | Who relies on current behavior? |
| Data | Are stored values, schemas, events, caches, or generated files affected? |
| Security | Do actor, tenant, authorization, paths, queries, prompts, or secrets change? |
| Lifetime | Do tasks, retries, cleanup, cancellation, or shutdown change? |
| Compatibility | Do imports, signatures, defaults, errors, payloads, or side effects change? |
| Operations | Does deploy order, rollout, logging, or rollback change? |
| Proof | What focused test and wider checks prove the behavior? |

A pure local function may need one caller and one test. Shared data, authorization, public APIs, or resource lifetime need a wider map.

## Find the owner

```diagram
+----------+     +-------------+     +----------+     +----------+
| External | --> | Input layer | --> | Use case | --> | Business |
| input    |     | parses      |     | policy   |     | rule     |
+----------+     +-------------+     +----+-----+     +----------+
                                        |
                                        v
                                  +------------+
                                  | Storage or |
                                  | output     |
                                  +------------+
```

The owner is the narrowest place with enough context to enforce the rule for every affected path.

Do not:

- hide bad upstream data in presentation code;
- repeat the same validation in many consumers;
- translate one provider error in every caller;
- wrap a symptom while leaving the source of truth wrong;
- put domain policy in a framework callback just because the failure appears there.

## Choose in this order

1. no change;
2. delete needless behavior;
3. fix the source of truth;
4. reuse an existing mechanism;
5. make a local fix when the problem is truly local;
6. add a compatibility layer for callers that cannot move together;
7. add an abstraction only for real policy, conversion, variation, or lifetime.

Compare new concepts, affected callers, failure modes, compatibility, proof cost, and rollback. A slightly larger owner-level fix is simpler than a tiny workaround that every caller must understand.

## Prove and stop

1. Show the original failure or behavior.
2. Exercise the fixed caller-visible path.
3. Cover relevant failure, cleanup, denial, or compatibility behavior.
4. Run project lint and type checks.
5. Recheck mapped consumers.
6. Run broader tests only when the rule crosses those boundaries.

Do not prove only mock call order when output, state, error, or cleanup can prove the contract.

Stop when the owner enforces the rule, affected contracts are safe, focused checks pass, and no new surface remains unchecked. Do not continue into nearby cleanup.
