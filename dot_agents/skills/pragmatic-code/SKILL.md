---
name: pragmatic-code
description: Plan, implement, or review Python, TypeScript, and Vue changes through caller-visible contracts.
disable-model-invocation: true
argument-hint: "[plan|implement|review] [paths or diff base]"
---

# Pragmatic Code

**Contract → owner → proof.** A contract is the behavior callers can rely on. An owner is the narrowest place with enough context and authority to enforce it. Proof is observable evidence that the contract holds.

## 1. Select mode, scope, and stack

Infer the mode from the request: design or approach means **plan**, change or fix means **implement**, and assessment or diff means **review**. Ask if ambiguity could cause an unwanted edit.

Plan and review are read-only. Do not edit project files, install dependencies, fetch remotes, rewrite caches, run formatters, or publish reports merely to inspect code. Use checks that respect this boundary; report checks that require additional permission. Implement mode authorizes only the requested change, not tooling installation or remote mutations.

Read applicable repository guidance, worktree state, manifests, configured checks, installed versions, and nearby examples. Repository guidance owns project policy; this skill owns the process. Surface conflicts between explicit user standards and repository policy before taking an affected action. Work-specific tools and rules come from the codebase's guidance, not the machine profile, home path, or language.

For a diff review, establish the exact comparison and whether staged, unstaged, or untracked work belongs in scope. Resolve a supplied base before reviewing. If the comparison is unclear, ask; if it is empty, report that and stop. Preserve a supplied diff command when another workflow dispatches the review.

**Complete when:** mode, editing permission, comparison or path scope, governing guidance, and the affected stack are clear.

## 2. Load references for the affected behavior

Read each applicable reference once; return to a specific section only when new evidence requires it. Select from the changed path and relevant callers, not every dependency installed in the repository.

| Condition | Read |
| --- | --- |
| Python code or Python runtime/configuration contract is affected | [Python](reference/python.md) |
| TypeScript/JavaScript types, execution, or runtime data are affected | [TypeScript](reference/typescript.md) |
| Vue components, templates, composables, stores, routing, or rendering are affected | [Vue](reference/vue.md); also TypeScript when its condition applies |
| Behavior changes or is under review | [Behavior checks](reference/review-lenses.md) |
| Module design, dependencies, or ownership change | [Architecture](reference/architecture.md) |
| Diagnosing or choosing a bug fix | [Pragmatic fixes](reference/pragmatic-fixes.md) |
| A shared gate or transformation changes for multiple callers | [Shared-gate audit](reference/shared-gates.md), before a safety conclusion |
| Review mode or accepting review findings in another mode | [Finding contract](reference/finding-contract.md) |
| Review mode or a material-risk change | [Independent review](reference/independent-review.md) |
| Presenting a plan, review, or summary | [Communication](reference/communication.md) |
| A rule is disputed or its source is requested | [Sources and limits](reference/corpus.md) |

For mixed stacks, load each affected reference and trace the cross-runtime contract: schema owner, serialization, errors, and both consumers. Keep one shared process and one final assessment; do not review each side in isolation.

For an uncovered stack, including Go or Effect-specific behavior, continue with the common process, local conventions, and official documentation for the installed version. State the specialized coverage gap. A Vue-only template change does not require Effect guidance merely because the app uses Effect.

**Complete when:** each affected language, framework, and cross-runtime contract has applicable guidance or an explicit coverage gap.

## 3. Establish the contract and run the selected mode

Trace the caller-visible path through inputs, decisions, effects, failures, and cleanup. Separate observed facts from reports and inference. Test suspected defects against existing validation, types, framework guarantees, defaults, and callers before accepting them. Follow unchanged code only as far as needed to establish the affected contract.

- **Plan:** identify the owner, affected callers, smallest coherent design, compatibility needs, and proof plan. Mark unresolved requirements and trade-offs as decisions, not invented behavior.
- **Implement:** record the baseline or reproduce the failure when practical, change the owner, and preserve unrelated behavior. Use existing mechanisms before adding a new concept. Review the resulting path, including meaningful failure and cleanup behavior.
- **Review:** inspect without fixing. Confirm or disprove each concern using the finding contract. Map missing proof separately from confirmed defects; finding one defect does not end review of the remaining affected contracts.

**Complete when:** every affected contract has a design and proof plan, an implemented path, or an evidence-backed review disposition appropriate to the mode. Unresolved paths are named, not counted as verified.

## 4. Verify and report

For implementation, rerun the original acceptance check through the caller-visible interface. Cover meaningful failures and affected consumers. Run configured focused tests and lint/type checks; add builds or broader suites when the changed surface or repository policy requires them. Diagnose failed checks, fix the cause, and rerun those checks rather than repeating unrelated ones. Keep assertions and checks intact.

For plan, specify the decisive checks without implementing the proposal. For review, use permissible focused checks or code-path evidence and state their limits. Keep deterministic diagnostics separate from judgment findings.

Report the outcome, owner and reason, decisive evidence, actual checks run, and material uncertainty. In review mode, use the finding contract's report format. Inspect the final diff for unintended changes in implement mode.

**Complete when:** each conclusion is supported at its stated confidence, failed or unrun checks are explicit, and affected contracts are accounted for. Stop there; nearby cleanup is separate work.
