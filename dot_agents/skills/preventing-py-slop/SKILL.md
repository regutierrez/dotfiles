---
name: preventing-py-slop
description: "Audits, reviews, installs, and migrates an opinionated Python anti-slop policy using Ruff and Basedpyright or the repository's existing type checker. Use only when explicitly invoked or when the user explicitly asks for Anti-Slop Py, Python slop review, or installation of these checks."
disable-model-invocation: true
argument-hint: "[audit|install|review|migrate] [paths...]"
---

# Prevent Py Slop

Find and prevent low-evidence Python code without turning ordinary Python idioms into universal bans.

## Invocation

Run only when explicitly requested. Do not apply this policy automatically to unrelated Python work.

Choose the workflow from the request:

- `audit`: inspect the repository and report a proposed setup without modifying files.
- `install`: install and configure checks, use native baselines where available, and report findings without cleaning them up.
- `review`: review named files or the current diff using the seven review lenses below.
- `migrate`: fix existing findings only when the user explicitly requests cleanup or migration.

Default to `audit` when no workflow is clear.

## Governing principles

- Preserve the repository's package manager, Python targets, configuration style, and existing checks.
- Prefer Basedpyright when a repository has no type checker. Preserve an established Basedpyright, Pyright, mypy, or other type checker unless migration is requested.
- Use Ruff for rules Ruff already implements.
- Use the type checker for semantic type rules rather than approximating them with syntax.
- Do not approximate runtime identity, control flow, architecture, or type semantics with a custom syntax checker.
- Allow dynamic escape hatches only at a clear boundary with a specific reason.
- Make a judgment-based issue blocking only when there is a concrete, simpler alternative that preserves intended behavior.
- Keep generic policy separate from framework, company, and repository policy.
- Never weaken severity, add blanket suppressions, broaden types, or add baseline entries merely to obtain a passing check.

Read [reference/principles.md](reference/principles.md) and [reference/checkers.md](reference/checkers.md) before proposing policy. Read [reference/examples.md](reference/examples.md) before adding or changing a rule. Read [reference/review.md](reference/review.md) before a review or migration.

## Inspect the repository

Before every workflow:

1. Read all applicable agent guidance.
2. Check worktree status and preserve unrelated changes.
3. Find every Python project in the repository, including independently locked monorepo packages.
4. Determine each project's supported Python version, source roots, test roots, generated code, and package manager.
5. Inspect `pyproject.toml`, lockfiles, Ruff configuration, type-checker configuration, test configuration, task runners, pre-commit hooks, and CI workflows.
6. Identify projects omitted from shared configuration or CI.
7. Run existing checks before proposing replacements.

Treat repository reports and apparent patterns as claims to verify. Use counts only to find concentrations; inspect representative code before calling a pattern harmful.

## Audit workflow

Report:

1. Existing Python tooling and which projects it covers.
2. Strong patterns that the policy must preserve.
3. Findings under each of the seven review lenses, with representative paths.
4. What Ruff already enforces.
5. What the type checker already enforces.
6. Which proposed concerns cannot be enforced reliably by the standard tools.
7. What must remain agent judgment.
8. Missing CI coverage and configuration drift.
9. A generic core and separately named repository or framework extensions.
10. An adoption plan that isolates existing findings without hiding new debt.

Do not modify files during an audit.

## Install workflow

Installation configures Ruff and semantic typing through the repository's existing package manager, task runner, and CI style.

Choose one policy root for each group of Python projects that shares configuration and commands. In a monorepo with independent Python projects, configure and run each project separately. Do not force unrelated environments through one command or baseline.

### 1. Configure Ruff

- Preserve existing Ruff settings and task commands.
- If Ruff is absent, query current package metadata and add the current compatible release through the existing package manager.
- Confirm each proposed code against the installed release with `ruff rule <CODE>`.
- Start with the high-signal rules in [reference/checkers.md](reference/checkers.md), then add only rules whose semantics fit representative project code.
- Sample additional rules with `--extend-select`; `--select` replaces the repository's configured rules and can make valid suppressions appear unused.
- Keep normal Ruff execution direct.
- Do not enable whole rule families merely because they are listed as candidates.
- Do not add blanket `noqa`, blanket `type: ignore`, or generated source suppressions to make adoption pass.

Ruff has no native baseline. For existing debt, enable small rule groups per clean project or path. Use the repository's changed-file runner only after the selected rules are clean for the files it gates. Use `per-file-ignores` only for a stable structural reason, not as a count-based baseline. Report remaining debt instead of creating a custom Ruff baseline.

### 2. Configure semantic typing

If the repository already has a type checker, preserve it and tighten only settings directly supported by the requested policy.

For a repository without one:

1. Query current package metadata and add Basedpyright through the existing package manager.
2. Start from `typeCheckingMode = "recommended"`.
3. Confirm and configure diagnostics for `Any`, unknown types, invalid and unnecessary casts, unused ignores, rule-less ignore comments, unused coroutines, unsafe optional access, unreachable code, and unnecessary checks as appropriate for the project.
4. Keep the repository's declared Python version and platform.
5. Do not suppress missing imports globally when a local stub or typed adapter is practical.

Use the exact diagnostic names in [reference/checkers.md](reference/checkers.md). `recommended` is broad and fails the CLI on warnings. Exact defaults and severities vary by release, so inspect the installed version, explicitly configure the selected policy diagnostics, and sample output before adoption.

For an existing codebase with findings, use one native baseline per independently configured project only after reviewing the unbaselined diagnostics from a clean worktree. `basedpyright --writebaseline` records every current unbaselined diagnostic, not only a newly enabled rule. Inspect the generated diff and counts before committing `.basedpyright/baseline.json`; never write a baseline in CI. Entries match by file, diagnostic, and column, so moved or replacement code at the same column can inherit old debt. Configure CI baseline locking deliberately and review automatic baseline removals. Do not add inline ignores for baseline debt or present a baseline as proof that all new debt is caught.

For mypy or another established checker, use its native equivalents for unused ignores, redundant casts, untyped function bodies, implicit optional values, and generic types. Do not install Basedpyright merely to duplicate a working checker.

### 3. Integrate normal checks

Use the repository's existing task runner and CI style. The normal quality path should run:

1. Ruff directly;
2. the configured type checker;
3. the repository's tests.

Do not claim installation is complete while a Python project remains outside lint, type, or test CI without explicitly reporting that gap.

### 4. Validate and report

Run the narrowest relevant checks first, then the repository's normal aggregate check. Report:

- dependency versions resolved from current metadata;
- configuration and CI changes;
- Basedpyright baseline paths and finding counts by diagnostic;
- Ruff rules enabled now and rules deferred because of existing debt;
- checks run and decisive results;
- projects still outside coverage;
- remaining findings without fixing them.

## Review workflow

Review the requested code against all seven lenses in [reference/review.md](reference/review.md):

1. type evidence;
2. boundary models;
3. failure handling;
4. testing and mocking;
5. unnecessary abstraction;
6. async work and resource ownership;
7. defensive handling of impossible states.

Run configured automated checks, then inspect code paths that tools cannot judge. For every blocking finding, state:

- the exact behavior at risk;
- the evidence in the code;
- the simpler concrete alternative;
- why the alternative preserves intended behavior.

Do not flag `Any`, `cast`, mocking, broad catches, long functions, dictionaries, or dynamic features solely because they exist.

## Migration workflow

Keep installation and cleanup separate. During an explicitly requested migration:

1. Group findings by root cause rather than rule code.
2. Fix one ownership boundary at a time.
3. Prefer inference, precise contracts, `Protocol`, `TypedDict`, validated models, type guards, context managers, and explicit dependency seams.
4. Replace silent fallback with a defined failure contract.
5. Replace implementation-level mocks with boundary fakes where that makes behavior clearer.
6. Remove one-use wrappers when direct code is simpler and ownership remains clear.
7. Re-run focused tests after each behavior-bearing change.
8. Review Basedpyright baseline diffs when resolved entries disappear; write a new baseline only from a clean, reviewed worktree when intentionally adopting known diagnostics.

Do not mechanically convert one escape hatch into another.
