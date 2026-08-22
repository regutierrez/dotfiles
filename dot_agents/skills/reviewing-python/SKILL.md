---
name: reviewing-python
description: "Designs, implements, and reviews clear, pragmatic Python changes. Use for Python code, fixes, refactors, reviews, and architecture decisions."
disable-model-invocation: true
argument-hint: "[plan|implement|review] [paths...]"
---

# Reviewing Python

Make the whole affected system simpler, not just the edited file.

> State the rule that must hold. Find the part of the system that owns it. Make the smallest coherent fix. Prove the behavior. Stop.

Inspect broadly enough to understand the effect. Edit only what the task requires.

## Write for the reader

Assume the reader is a junior developer who may have ADHD.

- Lead with the answer.
- Use short sections, short paragraphs, and plain words.
- Put one idea in each bullet.
- Define unfamiliar terms when first used.
- Put optional detail last.
- Never write a wall of text.

Before explaining architecture, ownership, data flow, state, lifetime, errors, concurrency, or blast radius, show a small ASCII diagram in a `diagram` block. Blast radius means everything a change can affect.

Read [reference/communication.md](reference/communication.md) before presenting a plan, review, or summary.

## Choose the mode

- **Plan:** stay read-only. Describe the invariant, owner, affected callers, smallest coherent change, compatibility, and proof.
- **Implement:** observe current behavior, edit the owner, verify caller-visible behavior, and review the result.
- **Review:** stay read-only. Report only findings allowed by [reference/finding-contract.md](reference/finding-contract.md).

If the mode is omitted, infer it from the request: design and approach requests mean plan, change and fix requests mean implement, and assessment or diff requests mean review. If ambiguity could cause an unwanted edit, ask before changing files.

## Load only what you need

- Design or refactor: [architecture-standard.md](reference/architecture-standard.md)
- Bug or behavior change: [pragmatic-fixes.md](reference/pragmatic-fixes.md)
- Any Python change that affects behavior: [review-lenses.md](reference/review-lenses.md)
- Review checks or material-risk change: [independent-review.md](reference/independent-review.md)
- Review findings: [finding-contract.md](reference/finding-contract.md)
- New or disputed rule: [corpus.md](reference/corpus.md)

## Workflow

1. **Set scope.** Read repository guidance and worktree state. Do not fetch, install, format, or mutate anything just to inspect it.
2. **Learn the local rules.** Find each Python project, version, package manager, normal checks, framework patterns, and nearby examples.
3. **State the invariant.** An invariant is a rule that must always hold. Separate facts from reports and guesses.
4. **Verify the problem should exist.** Reproduce the issue or trace a reachable failing path. Check whether existing validation, types, schemas, framework guarantees, or guards already prevent it. If you cannot verify the path, name the unverified assumption.
5. **Map the effect.** Check relevant callers, data, security, resource lifetime, public APIs, deployment, rollback, and proof.
6. **Find the owner.** The owner is the narrowest part of the system that has enough information and authority to enforce the invariant once.
7. **Choose the fix.** Apply the ordered options in [pragmatic-fixes.md](reference/pragmatic-fixes.md). Prefer deletion or a fix at the owner over a workaround later in the flow.
8. **Implement narrowly.** Reuse local patterns. Add no concept that the fix does not need.
9. **Review the result yourself.** Apply only the relevant lenses. Do not invent a finding for every lens.
10. **Get independent evidence.** Run applicable narrow checks. For material risk, also use one independent judgment reviewer. Follow [independent-review.md](reference/independent-review.md). Do not hand off ownership of the full review.
11. **Prove and stop.** Run the cheapest honest proof first, then wider checks only when the effect requires them.

For plan or review, do not change files or configuration, install dependencies, run formatters, fetch remotes, create reports, rewrite caches, or run commands with lasting side effects.

## Implementation rules

- Preserve unrelated behavior.
- Validate less-trusted values before internal code relies on them.
- Make failures useful to callers.
- Make resource and task ownership clear on success, failure, cancellation, and partial startup.
- Preserve public APIs and stored data formats, or provide a clear compatibility layer or migration.
- Test caller-visible behavior and meaningful failure paths.
- Do not add comments, wrappers, classes, protocols, or extension points just to make code look designed.

## Verification

Run checks in this order:

1. reproduce or record the original behavior;
2. run the focused behavior test;
3. run lint and type checks for the changed project;
4. recheck affected consumers, APIs, and data formats;
5. run the broader project check when needed.

Formatter, linter, type-checker, test, and build output are diagnostics, not judgment findings. Verify a reachable trigger and concrete impact before turning a diagnostic into a finding.

Do not weaken checks or assertions to force a pass. Stop when the rule holds, affected APIs and data formats are safe, affected consumers are covered, and the proof matches the risk.

## Automated checks

When `preventing-py-slop` is available, use its read-only repository inspection and configured Ruff, type-checker, and CI checks. Loading this skill authorizes that read-only use.

Run each applicable repository review check once. Independent narrow checks may run in parallel when each checks a distinct concern.

Do not repeat its judgment review. This skill owns architecture, behavior, and the final verdict.

Run `preventing-py-slop install` or `migrate` only when the user asks for those changes.

For a review, report only findings allowed by [finding-contract.md](reference/finding-contract.md). For an implementation, report what changed, why that location owns the rule, and the decisive proof.
