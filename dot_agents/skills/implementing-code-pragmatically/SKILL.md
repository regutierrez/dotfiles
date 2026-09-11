---
name: implementing-code-pragmatically
description: Plans and implements pragmatic, repository-native code changes through caller-visible contracts. Use for implementation work or read-only technical planning.
disable-model-invocation: true
argument-hint: "[plan|implement] [paths or objective]"
---

# Pragmatic Code

**Contract → owner → proof.** A contract is behavior callers can rely on. An owner is the narrowest place with enough context and authority to enforce it. Proof is observable evidence that the contract holds.

This skill owns planning and implementation. Use `code-review` for an independent review of a diff, branch, pull request, or snapshot.

## 1. Set mode and scope

Infer **plan** for design or approach requests and **implement** for change or fix requests. Ask if ambiguity could cause an unwanted edit.

Plan mode is read-only. Do not edit project files, install dependencies, fetch remotes, rewrite caches, run formatters, or publish reports merely to inspect code. Implement mode authorizes only the requested change, not tooling installation, publication, deployment, or other shared-state mutations.

Read applicable repository guidance, worktree state, manifests, configured checks, installed versions, and nearby examples. Repository guidance owns work and personal policy. Machine profile, language preference, and this skill do not silently override it.

Review scope follows affected behavior and callers. Edit scope follows the smallest coherent fix. Do not confuse files needed to understand impact with permission to refactor them.

## 2. Load shared engineering guidance

Load `pragmatic-engineering` with the affected languages/frameworks and relevant concerns. It owns shared technical principles, language/framework guidance, and exceptions. Load only references selected by that skill.

Pragmatic repository-native engineering is the default. Load strict TypeScript or Effect guidance only when the user explicitly requests it or repository guidance/configuration selects it. A dependency in a manifest or lockfile is not enough.

Load `codebase-design` only when interface depth, seam placement, or module design is part of the task. Load `tdd` only when the user requests its repeated vertical-slice workflow. Tooling installation and migrations remain owned by their dedicated anti-slop skills.

## 3. Understand before changing

State the intended caller-visible behavior. Verify whether the reported problem should exist by reproducing it or tracing a reachable path. Check whether existing validation, types, schemas, framework guarantees, or caller limits already prevent it. Separate observed facts from reports and hypotheses. A finding you did not derive yourself—subagent, tool, issue, earlier session—keeps the confidence of its source. Re-derive it before raising its severity, and carry its hedges word for word. Dropping a qualifier is how a correct finding turns false.

Trace inputs, decisions, effects, failures, state, and cleanup far enough to identify affected callers and the owner. For mixed stacks, trace schema ownership, serialization, errors, and consumers across runtime boundaries.

For a shared gate, map original, validation, stored, rebound, regenerated, and execution copies. Account for both false acceptance and false rejection and for retry compatibility before choosing a change.

## 4. Plan or implement

### Plan

Identify the owner, smallest coherent change, affected contracts, compatibility needs, meaningful alternatives, and proof plan. Mark unresolved requirements and trade-offs as decisions rather than inventing behavior. Do not edit.

### Implement

Read [pragmatic fixes](reference/pragmatic-fixes.md). For a bug fix or behavior change, first run or add the narrowest caller-visible check that can falsify the intended contract and observe it fail for the expected reason. Then correct the owner, reuse established mechanisms, preserve unrelated behavior, add no concept the contract does not need, and rerun that check to green.

When a literal test-first cycle is not the right proof—such as documentation or typo changes, generated files changed through their owner, configuration with a render or static-validation contract, data migrations requiring a representative dry run, or visual behavior requiring a rendered baseline—capture the closest falsifiable before/after evidence and state why it replaces an ordinary red test. Do not use the exception to skip a practical failing check for normal behavior changes.

Review the resulting path yourself, including meaningful failure, state, retry, cancellation, cleanup, compatibility, and rollback behavior where reachable.

## 5. Prove and report

In implement mode, rerun the original acceptance check through the caller-visible interface. Cover meaningful failures and affected consumers. Run configured focused tests and lint/type checks, then broader checks only when the changed surface requires them. Diagnose failures instead of repeating unrelated commands or weakening checks.

In plan mode, specify decisive caller-visible checks without running mutating setup. In both modes, report the owner and reason, affected contracts, actual evidence, checks run, and material uncertainty. Report the consequence you traced, not the one you expect: an untraced impact is unverified, so label it or drop it. Stating a hedged finding as a definite one is a reporting error even when the observation holds. Inspect the final diff for unintended changes in implement mode. Stop when the requested contract is proven; nearby cleanup is separate work.
