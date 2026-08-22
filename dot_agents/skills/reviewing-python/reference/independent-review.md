# Independent Review

The main agent owns the task, full review, final decision, and verification.

Use two kinds of independent work:

- **Narrow check:** checks one named concern, rule, or tool result. Run each applicable check once.
- **Judgment reviewer:** challenges the reasoning and highest-risk part of the change. Use at most one, and only for material risk.

Neither replaces the main review.

```diagram
+-------------+     +-------------------+
| Main review | --> | Applicable narrow |
+-------------+     | checks            |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    | Risk gate         |
                    +---------+---------+
                              |
                +-------------+-------------+
                |                           |
                v                           v
       +----------------+          +------------------+
       | Low risk       |          | Material risk    |
       | Verify + stop  |          | One judgment     |
       +----------------+          | reviewer         |
                                   +---------+--------+
                                             |
                                             v
                                   +------------------+
                                   | Main verifies    |
                                   | and decides      |
                                   +------------------+
```

## Run narrow checks

Run applicable repository checks and deterministic diagnostics even when a judgment reviewer is not needed.

- Give each check one named concern.
- Run independent checks in parallel when they do not overlap.
- Do not run two checks that make the same judgment in different words.
- Keep tool output separate from judgment findings.
- Verify reported problems before accepting them.

Ruff, type-checker, and CI evidence belongs to `preventing-py-slop`. Repository review checks may cover concerns such as security, compatibility, or resource lifetime.

## Use one judgment reviewer when

The change affects at least one of these areas:

- security, authorization, or tenant isolation;
- stored data, schemas, or migrations;
- public APIs or compatibility;
- concurrency, background work, or resource lifetime;
- several modules, services, or Python projects;
- an unresolved high-impact ownership or design question after direct investigation.

Skip the judgment reviewer for a small local change with a clear owner, narrow effect, and direct proof. Still run applicable narrow checks.

## Give the reviewer one clear job

Provide:

- the rule that must hold;
- intended behavior;
- exact files and affected path;
- verified facts and reproduction evidence;
- known callers and blast radius;
- repository constraints;
- the one risk or question to challenge;
- what unrelated areas to ignore.

Ask for code-path evidence, concrete impact, the smallest safe fix, and the proof needed. Keep the review read-only.

An Amp-native review fills this one judgment-reviewer slot. Give it the same focused brief. Do not also launch a generic reviewer over the same change.

## Main agent checks the result

For every finding:

1. inspect the cited path;
2. reproduce or trace the trigger;
3. look for validation, ownership, or compatibility evidence the reviewer may have missed;
4. accept only findings that meet [finding-contract.md](finding-contract.md);
5. decide and verify the final fix.

Do not accept a finding because another agent produced it.

## Avoid review noise

- Do not hand off ownership of the full review.
- Do not ask several reviewers to scan the same diff.
- Do not use a generic "find anything wrong" prompt.
- Do not repeat the full review after a fix.
- Use a follow-up reviewer only to check a specific earlier finding and its fix. It uses the same judgment-reviewer slot; do not add another reviewer.
- If no independent reviewer is available, run the focused challenge yourself and continue.

Mention the independent review only when it changes the conclusion, confirms a high-risk point, or leaves important uncertainty.
