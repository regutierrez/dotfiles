---
name: installing-anti-slop-py
description: "Audits, installs, and migrates Python lint and type-checking policy with Ruff and the repository's existing checker or Basedpyright. Use only for explicit Python anti-slop tooling adoption or migration."
argument-hint: "[audit|install|migrate] [paths...]"
---

# Install Python anti-slop tooling

Configure deterministic Python checks without creating a second code-review workflow. `code-review` decides whether diagnostics are findings; this skill owns only tooling discovery, adoption, baselines, and migration.

## Choose the workflow

- `audit`: inspect current coverage and propose an adoption plan without editing files.
- `install`: configure checks and report existing findings without cleaning them up.
- `migrate`: fix existing findings only when the user explicitly requests cleanup.

Default to `audit` when the request does not select one. Do not invoke this skill automatically for ordinary Python implementation or review.

## Inspect every Python project

Before any workflow:

1. Read applicable repository guidance and preserve unrelated work.
2. Find independently configured or locked Python projects, supported versions, source/test/generated roots, and package managers.
3. Inspect Ruff, type-checker, test, task-runner, pre-commit, and CI configuration.
4. Run existing checks and identify projects omitted from the normal quality path.

Read [checker ownership and rollout](reference/checkers.md) before proposing or changing policy. Rules listed there are candidates, not a preset.

## Audit

Report existing tools and coverage, uncovered projects, representative diagnostics, supported adoption boundaries, and a staged plan that does not hide existing debt. Separate deterministic Ruff/type-checker output from engineering judgment. Do not modify files.

## Install

Preserve the repository's package manager, supported Python versions, configuration style, checker, and task/CI conventions.

1. Use Ruff for syntax-level rules it actually implements. Confirm every proposed code against the installed release with `ruff rule <CODE>` and sample with `--extend-select` so existing selections remain active.
2. Preserve an established Basedpyright, Pyright, mypy, or other checker. If none exists, install a current compatible Basedpyright and begin from `typeCheckingMode = "recommended"`, then configure only diagnostics supported by the installed version and representative code.
3. Do not invent a Ruff baseline. Stage clean rules by project or stable path; reserve `per-file-ignores` for structural exceptions.
4. For Basedpyright debt, inspect the complete unbaselined run before writing one native baseline per independently configured project. Review the generated diff and counts, never write a baseline in CI, and configure locking deliberately.
5. Wire Ruff, the selected checker, and tests into the repository's normal task and CI path. Report any Python project still outside coverage.

Installation does not authorize fixing findings. Never weaken severity, add blanket suppressions, broaden types, or record unexplained baseline entries to manufacture a green result.

## Migrate

Keep tooling adoption and cleanup separable. Group findings by root cause, fix one ownership boundary at a time, and rerun focused behavior tests plus configured checks. Prefer precise contracts, inference, validated boundary models, protocols, context managers, and explicit dependency seams over exchanging one escape hatch for another. Review every baseline removal or rewrite.

## Report

State resolved dependency versions, configuration and CI changes, enabled and deferred diagnostics, baseline paths and counts, commands and decisive results, uncovered projects, and remaining findings. Do not issue a behavioral review verdict.
