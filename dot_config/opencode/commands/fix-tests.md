---
description: Find failing tests, explain one clearly, and optionally apply a minimal targeted fix
---

You are running the `/fix-tests` workflow.

User arguments: `$ARGUMENTS`

Goal: detect how this repo runs tests, list failures, let the user choose **ONE** failing test, explain that failure clearly, propose the smallest likely fixes, and only edit when the user explicitly asks.

## Non-negotiables

- Inspect repo config files first. Do **not** guess the test command.
- Prefer explicit project scripts/config over framework assumptions.
- Do **not** edit until the user explicitly says to apply/fix/do it.
- Work on **ONE** failing test at a time. Do not continue to others.
- After a test is selected, use the narrowest test command available.
- No drive-by cleanup, broad refactors, renames, or dependency upgrades unless required for the selected failure.
- If the smallest plausible fix risks other tests, warn first.

## Process

1. Find the real test command from repo config. Check common entrypoints like `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `vitest.config.*`, `jest.config.*`, `playwright.config.*`, `pyproject.toml`, `pytest.ini`, `tox.ini`, `Cargo.toml`, `go.mod`, `Makefile`, `justfile`, `Gemfile`, `composer.json`, `deno.json*`.
2. Tell the user:
   - which files you used
   - the exact test command you chose
   - why it is the best match
3. Run the failure-discovery command.
   - If `$ARGUMENTS` is present, treat it only as a preferred target **after** discovery.
   - If the canonical command is too heavy or exits on first failure, explain the limitation and choose the closest project-supported discovery command.
4. Summarize failures as a numbered list:
   1. failing test name
   2. test file
   3. one-line symptom
   Then stop and ask which failing test to tackle first.
5. For the selected failure, re-run just that test or the smallest enclosing suite. Read only the files needed to understand it.
6. Then respond using this exact structure:

## Selected failure
- test: ...
- file: ...
- symptom: ...
- likely bug: ...

## Why this is failing
Explain for a junior dev with zero codebase context.
Short sentences. Minimal jargon. Concrete cause/effect.

## Best hypotheses
Give at least **2** high-signal hypotheses unless one root cause is overwhelmingly clear.
For each hypothesis include:
- confidence: high / medium
- evidence: what in the code, test, or output points to it
- why it could cause this exact failure

## Smallest likely fixes
Show **2+** real candidate fixes when possible. If only 1 is credible, say why.
For each candidate:
- keep it as small as possible
- explain blast radius
- say if it could fail another test and why
- include a fenced `diff` block with minimal context and current `@@ ... @@` hunk ranges

```diff
diff --git a/path/to/file b/path/to/file
@@ -110,3 +110,3 @@
- old
+ new
```

## Why the fix works
Explain why the strongest candidate changes runtime behavior so the selected test passes.
Tie it directly to the symptom.

7. Ask whether to apply the strongest candidate for this **specific** test.
8. If the user explicitly says to apply/fix/do it:
   - apply only the smallest fix for the currently selected test
   - re-run only the selected test or smallest enclosing suite
   - report:
     - what changed
     - whether the selected test now passes
     - whether any direct safety check failed
     - what failing tests remain untouched

## Style

- Explain as if talking to a junior dev new to the repo.
- Sacrifice grammar for terseness.
- No fluff. No fake certainty.
- Prefer: "this line does X, test expects Y, so it breaks".
- Separate facts from inference.
- If tests cannot run, say why and stop.
- If no tests fail, say so and stop.
- If `$ARGUMENTS` names a test, still verify it from real test output before editing.
