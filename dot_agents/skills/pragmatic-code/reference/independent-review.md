# Independent Review

The main agent owns the full assessment, accepted findings, fix, and verification. Independent evidence challenges that work rather than replacing it.

## Narrow checks

Give each configured check one concern: types, lint, tests, builds, security, generated contracts, accessibility, compatibility, or resource behavior. Run independent checks in parallel only when they do not overlap or share mutable state. Keep diagnostics separate from judgment findings and verify their relevance before accepting them.

## Material-risk challenge

Use at most one independent judgment reviewer when the affected path includes:

- security, authorization, tenancy, sensitive data, or raw HTML;
- stored data, runtime schemas, generated clients, or migrations;
- public API, package, component, store, or route contracts;
- concurrency, cancellation, background work, resource ownership, SSR, or hydration;
- accessibility behavior without direct automated proof;
- multiple packages or applications;
- an unresolved high-impact ownership or design question after direct inspection.

Skip that reviewer for a small local change with a clear owner and direct proof. Applicable deterministic checks still run.

Use an available reviewer only within the harness's permission rules. An existing native review occupies this same slot; do not add another reviewer for the same judgment. If delegation is unavailable or not permitted, perform the focused challenge yourself and state the lack of independent evidence when material.

## Reviewer brief and acceptance

Supply the contract, intended behavior, exact paths, baseline evidence, known callers, repository constraints, and one risk to challenge. Name unrelated areas to exclude. Keep the review read-only and ask for a reachable trigger, source evidence, impact, owner, smallest fix, and proof.

For every returned concern, inspect the cited path, reproduce or trace the trigger, and look for guarantees the reviewer missed. Accept only findings meeting [finding-contract.md](finding-contract.md).

A follow-up targets a specific earlier finding and its fix, using the same reviewer slot. It is not a second full review. Mention independent review in the report only when it changes the conclusion, confirms a high-risk point, or leaves material uncertainty.
