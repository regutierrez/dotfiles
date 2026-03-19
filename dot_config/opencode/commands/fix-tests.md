---
description: Discover failing tests, explain one clearly, and optionally apply a minimal targeted fix
---

You are running the `/fix-tests` workflow.

User arguments: `$ARGUMENTS`

Goal: find how this repo runs tests, show failures, let the user pick **ONE** failing test, explain it clearly, propose minimal fixes, and only apply a fix when the user explicitly asks.

## Hard rules

- Start by inspecting repo config files. Do **not** guess test commands before checking config.
- Prefer explicit project scripts/targets/config over framework assumptions.
- Do **not** edit code until the user explicitly says to apply a fix.
- Fix only **ONE** failing test at a time.
- When user says "do the fix", "fix it", or equivalent, apply only the smallest change needed for the **currently selected** failing test.
- Do **not** continue on to other failing tests after the selected test is fixed or re-run.
- Avoid speculative refactors.
- Use the narrowest possible test command after selecting a test.
- If the selected fix is likely to break other tests, say so plainly before editing.

## Workflow

### 1. Find how this repo runs tests

Inspect repo config files first. Look for the real project entrypoints for tests, for example:

- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`
- `vitest.config.*`, `jest.config.*`, `playwright.config.*`, `cypress.config.*`
- `pyproject.toml`, `pytest.ini`, `tox.ini`
- `Cargo.toml`, `go.mod`, `Makefile`, `justfile`
- `Gemfile`, `composer.json`, `deno.json*`

Then tell the user:

- which files you used to decide
- the exact test command you chose
- why that command is the best match

### 2. Discover the failures

Run the repo's failure-discovery test command.

- If `$ARGUMENTS` is non-empty, treat it as a **preferred failing test / file / pattern** to focus on **after** discovery.
- If the main test command is obviously too heavy, explain why and choose the closest project-supported alternative for discovering failures.
- If the default test command exits on first failure, still use it if that is the canonical project entrypoint. Just explain the limitation.

Summarize failures as a numbered list with:

1. failing test name
2. test file
3. 1-line symptom

Then stop and ask the user which failing test to tackle first.

- If there are no failing tests, say so and stop.
- If tests cannot run, explain the blocking config/runtime problem and stop.

### 3. After user picks ONE failure, isolate it

For the selected failure:

- Re-run just that test, or the smallest enclosing suite if single-test targeting is unavailable.
- Read only the files needed to understand the failure path.
- Do not start editing yet.

### 4. Explain the selected failure

Explain it like the reader is smart but new to this repo.

Use this exact output structure:

## Selected failure
- test: ...
- file: ...
- symptom: ...
- likely bug: ...

## Why this is failing
Explain the bug for a junior dev with no codebase context.
Short sentences. Minimal jargon. Concrete cause/effect.

## Best hypotheses
Give at least **2** highly probable hypotheses unless one root cause is already overwhelmingly clear.
If there are more real contenders, include them.

For each hypothesis include:
- confidence: high / medium
- evidence: what in the code, test, or output points to it
- why it could cause this exact failure

## Smallest likely fixes
Show **2+ candidate fixes** when real alternatives exist. If only 1 is credible, say why.

For each candidate:
- keep patch as small as possible
- include the likely edit location as a file reference with line numbers when you can, like `@path/to/file:L10-L16`
- prefer behavior-preserving changes
- explain blast radius
- if it may fail another test, say exactly why

Use GitHub-style fenced `diff` blocks with hunk headers and minimal context, for example:

```diff
diff --git a/path/to/file b/path/to/file
@@ -10,7 +10,7 @@
- old
+ new
```

The diff must be illustrative and as close as possible to the real patch shape.

## Why the fix works
Explain why the strongest candidate changes runtime behavior so the selected test passes.
Tie it directly back to the failure symptom.

### 5. Wait for permission

Do **not** edit anything yet.

Ask the user whether to apply the strongest candidate fix for this **specific** test.

### 6. If user explicitly says to apply the fix

- Apply only the fix for the **currently selected** test.
- Do not fix unrelated failures.
- Do not keep going after this one.
- Re-run only the selected test, or the smallest enclosing suite if unavoidable.
- Report:
  - what changed
  - whether the selected test now passes
  - whether any direct safety check failed
  - what other failing tests remain untouched

## Style rules for explanations

- Explain as if talking to a junior dev with zero codebase context.
- Sacrifice grammar for terseness.
- No fluff. No fake certainty.
- Prefer: "this line does X, test expects Y, so it breaks"
- Avoid vague summaries with no mechanism.
- If unsure, separate facts from inference.

## Editing guardrails

- No drive-by cleanup.
- No renames unless required for the selected failure.
- No broad refactors.
- No dependency upgrades unless the failure is directly caused by broken dependency/test config.
- If the only plausible fix touches shared behavior and risks other tests, warn first and explain why no narrower change exists.

If `$ARGUMENTS` names a specific failing test, still verify it from actual test output before editing.
