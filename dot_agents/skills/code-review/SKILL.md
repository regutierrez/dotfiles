---
name: code-review
description: "Reviews code independently for correctness, regressions, caller impact, and indirect effects. Use for pull requests, branches, diffs, commits, or work-in-progress changes."
argument-hint: "<fixed-point>"
---

# Code Review

Investigate whether the change preserves actual caller-visible contracts. Standards compliance is evidence, not the purpose of the review.

Review is read-only. Do not edit files, install dependencies, rewrite caches, run formatters, or change shared state. If required history is missing, ask before fetching unless the user already authorized it.

## 1. Pin scope and policy

Read repository guidance and worktree state. Resolve the requested base, head, staged, unstaged, and untracked scope. If the comparison is unclear, ask. If it is empty, report that and stop.

Repository guidance owns work and personal policy. Do not infer stricter standards from the machine, language, or reviewer preference.

Load `pragmatic-engineering` with every affected language/framework and relevant concern. For mixed stacks, load every affected language reference and trace the cross-runtime contract. Strict TypeScript or Effect guidance applies only when the user or repository explicitly selects it.

## 2. Establish intended and baseline behavior

State intended behavior from the request, tests, documentation, prompts, schemas, and callers. Treat issue reports and proposed diagnoses as claims to verify.

For every suspected regression, establish the same trigger's behavior and contract at the comparison base. Earlier rejection or a changed error location alone is not a regression. A finding needs previously valid behavior that the diff breaks, or a material caller-visible worsening introduced or exposed by the diff.

## 3. Trace affected behavior

Review scope follows affected behavior, not only edited files. Trace relevant callers, consumers, subclasses, registrations, configuration, defaults, state, stored forms, generated artifacts, and deployment order. Keep edit suggestions limited to the smallest safe owner.

Follow inputs through decisions, effects, outputs, errors, retries, cancellation, cleanup, concurrency, persistence, and rollback where the changed contract can reach them. Check both successful and failing paths. Inspect enough unchanged code to prove or disprove impact; do not widen into unrelated cleanup.

When a change gates selection, readiness, status, navigation, or execution, build a compact **producer representation × trigger × state × observable consumer** matrix. Derive representations from real producers and schemas; normalized test values do not cover raw numeric, numeric-string, opaque-ID, null, legacy, or discriminated variants that take different branches. Include meaningful transitional and terminal states and automatic and user-driven triggers. Every row must state expected behavior, base behavior, head behavior, downstream effect, and one disposition: confirmed defect, no defect, missing proof, or decision. An inventory without row dispositions is incomplete.

For each relevant status or diagnostic, trace the exact field from producer through storage or transport to the renderer before and after the change. Record the expected visible outcome and disposition for each field. A surface name is not evidence that its renderer consumes the same information. If a gate blocks the selected/detail route, prove that a remaining card, history, or fallback renderer presents equivalent actionable information.

Before claiming that work never retries, never recovers, or permanently loses state, trace every polling source, watcher, rendered child component, emitted event, callback, retry owner, and terminal-state transition. In reactive code, prove the relevant scheduling/interleaving with framework semantics or a focused test. Distinguish temporary loss, terminal loss, and eventual recovery.

Matrix gaps become findings only when the diff introduces them, newly routes a trigger to them, or removes behavior that previously mitigated them. A broad intended invariant does not turn an unchanged pre-existing hole into a regression. Treat an incomplete migration as a finding only when the diff claims or structurally owns complete migration of that consumer class; otherwise record the residual hole as coverage or missing proof. Keep unrelated pre-existing inconsistencies out of the defect list.

For every concern, distinguish:

- a **confirmed defect** with a reachable trigger and concrete impact;
- **missing high-risk proof** whose absence limits confidence but does not prove a defect;
- an **unresolved decision** that code cannot settle.

Finding one defect does not end investigation of other affected contracts or the opposite failure direction.

## 4. Audit shared gates

When shared validation, normalization, binding, authorization, transformation, retry, persistence, or execution changes, read [shared-gate audit](reference/shared-gate-audit.md) and complete it before a safety verdict.

For every gate, inventory each caller and the producer state at gate entry—not merely the state eventually written. Record expected outcome, base result, head result, later side effects or retry, and a disposition for every caller row. Symbolic-key analysis is an additional requirement when keys exist, not a replacement for caller-state analysis.

Inventory downstream consumers first: binders, replacement maps, allowlists, schemas, and parameter transformers define the keys that must be traced. Only then search upstream producers. For Python literal-key consumers, use the bundled [shared-gate ledger](reference/shared-gate-ledger.md). For other languages, build the same inventory and evidence manually with available repository tools. Automated extraction supplements inspection and never proves dynamic-key completeness.

Do not infer one key's phase from a sibling key, shared prefix, or binder family. Every pre-gate or post-gate classification needs evidence for that exact key or generated family. Before a shared-gate safety verdict, require `consumer keys − traced keys = ∅`, or explicitly withhold the verdict.

Treat every reachable symbolic occurrence in a prompt, template, example, or generated instruction as a pre-gate producer, even when another instruction forbids that key in a different role. Quote the assembled producer contract and classify the key as required, allowed, forbidden, or conditional. Do not summarize “segment binds,” “filter keys,” or another family until every member's producer requirement is established.

Always examine both:

- false acceptance: invalid input disappears or passes;
- false rejection: legitimate deferred or framework-owned input is rejected before its owner handles it.

Compare retry feedback with producer requirements. Prove whether regeneration can satisfy both contracts rather than assuming every earlier rejection is new breakage.

## 5. Check and challenge

Run permissible focused tests and configured read-only lint, type, build, schema, or compatibility checks. Diagnostics are leads; inspect their relevance before accepting findings. Do not delegate ownership of the review to another agent.

If a required audit or deterministic evidence tool fails, diagnose it once. If it cannot run without violating review constraints, report the audit as incomplete and withhold the affected safety conclusion. Do not silently replace a failed completeness gate with an informal search and then claim complete coverage.

Track coverage separately from finding quality. Record affected contract classes examined, unresolved paths, unavailable checks, and excluded scope. A complete-looking table does not make a weak finding valid, and one strong finding does not establish complete coverage.

Before the verdict, reconcile every required matrix row to the findings, no-defect evidence, missing proof, or decisions sections. Do not leave contradictory evidence only in coverage tables.

## 6. Report

Read [finding contract](reference/finding-contract.md). Lead with confirmed findings ordered by severity, each with location, contract, trigger, causal path, impact, owner, smallest safe fix, and proof. Then include only relevant decisions, missing high-risk proof, coverage limits, checks run, and verdict.

If there are no findings, say so without implying complete coverage. Never promise to catch every defect or turn speculative concerns into proven bugs.
