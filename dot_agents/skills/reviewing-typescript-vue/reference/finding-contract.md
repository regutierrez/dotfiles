# Review Findings

Report only findings that change an engineering or product decision.

## Must fix

Use for a verified failure in behavior, correctness, security, lifecycle, accessibility, or compatibility.

An accepted finding needs:

1. the invariant that should hold;
2. a reachable trigger;
3. code-path evidence;
4. concrete caller or user impact;
5. affected callers or consumers;
6. the part of the system that owns the rule;
7. the smallest safe fix;
8. proof that can confirm the fix;
9. compatibility or rollback effect when relevant.

It must also explain why the fix preserves intended behavior. Use one short paragraph for a local issue. Use the full chain for a cross-package, lifecycle, or migration issue.

## Decision needed

Use only for a real product, domain, accessibility, policy, compatibility, or rollout choice that code cannot answer.

State the question, viable options, effect of each option, who or what can decide it, and whether work can continue safely.

Do not label an engineering preference as a product decision.

## Investigate first

Suspicion is not a finding. Check for:

- earlier parsing, validation, authorization, or normalization;
- TypeScript, schema, generated-client, or framework guarantees;
- Vue ownership, automatic effect disposal, and runtime escaping behavior;
- caller limits and supported input ranges;
- existing cancellation, cleanup, and stale-result protection;
- compatibility tests, adapters, or migrations;
- intentional repository behavior.

Omit unsupported concerns. Do not create speculative, style-only, diagnostic-only, or future-proofing findings.

Review enough unchanged code to understand the change's effect. Keep findings tied to behavior introduced, exposed, or made wrong by the change. Do not block on unrelated cleanup.

## Output

Lead with findings, highest impact first. Give the location, failure, evidence, affected path, owner, smallest fix, and proof.

For a finding that crosses modules, components, lifecycle stages, async work, or deployment steps, show the failing path in a small `diagram` block. Follow [communication.md](communication.md).

Then list:

- decisions needed;
- automated diagnostics, separate from judgment findings;
- uncertainty and unverified areas;
- checks run;
- the verdict.

If there are no findings, say so directly.
