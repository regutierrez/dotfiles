# Independent Review

The main agent owns the task, full review, final decision, and verification.

Use two kinds of independent evidence:

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
- Keep compiler, linter, formatter, test, and build output separate from judgment findings.
- Verify reported problems before accepting them.

Repository checks may cover types, lint, tests, builds, generated contracts, accessibility, security, compatibility, or lifecycle behavior.

## Use one judgment reviewer when

The change affects at least one of these areas:

- security, authorization, tenancy, raw HTML, or sensitive data;
- stored data, runtime schemas, events, generated clients, or migrations;
- public package, component, composable, store, route, or API contracts;
- concurrency, cancellation, background work, SSR, hydration, or lifecycle ownership;
- accessibility behavior without direct automated proof;
- several packages or applications;
- an unresolved high-impact ownership or design question after direct investigation.

Skip the judgment reviewer for a small local change with a clear owner, narrow effect, and direct proof. Still run applicable narrow checks.

## Give the reviewer one clear job

Provide:

- the invariant;
- intended behavior;
- exact files and affected path;
- verified facts and reproduction evidence;
- known callers and blast radius;
- repository constraints;
- the one risk or question to challenge;
- unrelated areas to ignore.

Ask for a reachable trigger, code-path evidence, concrete impact, owner, smallest safe fix, and proof. Keep the review read-only.

An Amp-native review occupies this one judgment-reviewer slot. Do not also launch a generic reviewer over the same change.

## Main agent checks the result

For every proposed finding:

1. inspect the cited path;
2. reproduce or trace the trigger;
3. look for type, schema, Vue, ownership, or compatibility evidence the reviewer may have missed;
4. accept only findings that meet [finding-contract.md](finding-contract.md);
5. decide and verify the final fix.

Do not accept a finding because another agent produced it.

## Avoid review noise

- Do not hand off ownership of the full review.
- Do not ask several reviewers to scan the same diff.
- Do not use a generic "find anything wrong" prompt.
- Do not repeat the full review after a fix.
- Use a follow-up reviewer only to check a specific earlier finding and its fix; it uses the same reviewer slot.
- If no independent reviewer is available, run the focused challenge yourself and continue.

Mention the independent review only when it changes the conclusion, confirms a high-risk point, or leaves important uncertainty.
