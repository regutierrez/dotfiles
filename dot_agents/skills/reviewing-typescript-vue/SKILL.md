---
name: reviewing-typescript-vue
description: "Designs, implements, and reviews clear, pragmatic TypeScript and Vue changes. Use for TypeScript or Vue plans, fixes, refactors, reviews, components, composables, stores, routing, and frontend architecture decisions."
disable-model-invocation: true
argument-hint: "[plan|implement|review] [paths...]"
---

# Reviewing TypeScript and Vue

Make the whole affected path simpler, not just the edited file.

> State the rule that must hold. Verify the problem should exist. Find the narrowest owner. Make the smallest coherent fix. Prove caller-visible behavior. Stop.

Inspect broadly enough to understand the effect. Edit only what the task requires.

## Write for the reader

Assume the reader is a junior developer who may have ADHD.

- Lead with the answer.
- Use short sections, short paragraphs, and plain words.
- Put one idea in each bullet.
- Define unfamiliar terms when first used.
- Put optional detail last.
- Never write a wall of text.

Before explaining architecture, ownership, flow, state, lifecycle, concurrency, errors, or blast radius, show a small ASCII diagram in a `diagram` block.

Read [reference/communication.md](reference/communication.md) before presenting a plan, review, or summary.

## Choose the mode

- **Plan:** stay read-only. Describe the invariant, current owner, affected callers, smallest coherent change, compatibility, and proof.
- **Implement:** observe current behavior, change the owner, verify the caller-visible path, and review the result.
- **Review:** stay read-only. Report only findings accepted by [reference/finding-contract.md](reference/finding-contract.md).

Treat supplied paths as the starting scope. Follow callers, contracts, and boundaries only as far as needed to understand the effect.

## Load only what applies

- Design or refactor: [architecture-standard.md](reference/architecture-standard.md)
- Bug or behavior change: [pragmatic-fixes.md](reference/pragmatic-fixes.md)
- TypeScript contracts or runtime data: [typescript-contracts.md](reference/typescript-contracts.md)
- Vue component, composable, store, router, or UI work: [vue-guidance.md](reference/vue-guidance.md)
- Any behavior-affecting change: [review-lenses.md](reference/review-lenses.md)
- Review checks or material-risk change: [independent-review.md](reference/independent-review.md)
- New or disputed rule: [corpus.md](reference/corpus.md)

## Workflow

1. **Set scope.** Read repository guidance and worktree state. Do not fetch, install, format, or mutate anything merely to inspect it.
2. **Learn the local stack.** Find workspace boundaries, package manager, TypeScript and Vue versions, runtime, build tool, router, store, test stack, configured checks, and nearby examples.
3. **State the invariant.** An invariant is a rule that must always hold. Separate observed facts from reports and guesses.
4. **Verify the problem should exist.** Reproduce it or trace a reachable failing path. Check whether types, schemas, framework behavior, or earlier guards already prevent it.
5. **Map callers and blast radius.** Check only relevant components, composables, stores, routes, services, runtime boundaries, public contracts, async work, accessibility, deployment, and proof.
6. **Find the owner.** Choose the narrowest part with enough information and authority to enforce the invariant once.
7. **Choose the fix.** Apply [reference/pragmatic-fixes.md](reference/pragmatic-fixes.md). Prefer deletion or an owner-level correction over a downstream workaround.
8. **Implement narrowly.** Reuse local patterns. Add no concept, wrapper, generic, or extension point the fix does not need.
9. **Review the result.** Apply only relevant lenses. Do not invent one finding per lens.
10. **Get independent evidence.** Run applicable narrow checks. For material risk, use at most one independent judgment reviewer. Follow [reference/independent-review.md](reference/independent-review.md).
11. **Prove and stop.** Verify caller-visible success, meaningful failure behavior, affected consumers, and repository-native checks. Stop when the evidence matches the risk.

For read-only review, do not change files or configuration, install packages, fetch remotes, create reports, rewrite caches, or run commands with lasting side effects.

## Implementation rules

- Preserve unrelated behavior.
- Parse less-trusted runtime values before trusted code relies on them.
- Keep each rule, side effect, request, subscription, timer, and cleanup with a clear owner.
- Make expected errors useful to callers and users.
- Preserve public types, runtime schemas, events, routes, stored data, package exports, and rendered behavior, or provide an explicit compatibility plan.
- Test through the nearest stable interface: output, DOM, emitted event, navigation, state, error, cleanup, or public type.
- Use repository-native conventions. Do not impose a folder layout or framework pattern from this skill.
- Do not add comments, wrappers, components, composables, stores, classes, schemas, or generic abstractions merely to make code look designed.

## Verification

Run the cheapest applicable proof first:

1. reproduce or record the original behavior;
2. run the focused behavior or type test;
3. run configured lint and type checks for the changed package;
4. recheck affected callers and public contracts;
5. run the relevant build or broader suite only when the blast radius requires it.

Use the repository's own scripts and package manager. Run `vue-tsc`, `tsc`, ESLint, Oxlint, component tests, browser tests, or builds only when configured or clearly required by the changed surface.

Keep compiler, linter, formatter, and test output under **diagnostics**, separate from judgment findings. Verify a diagnostic before turning it into a finding.

`install-anti-slop` owns anti-slop plugin installation, dependencies, configuration, migration, and rule rollout. This skill may run an already-configured repository lint command. Do not install, update, copy, enable, disable, or weaken anti-slop rules unless the user explicitly asks for that tooling change.

The main agent owns architecture, behavior, accepted findings, the fix, verification, and the final verdict.
