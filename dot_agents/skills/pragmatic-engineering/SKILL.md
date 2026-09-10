---
name: pragmatic-engineering
description: "Provides shared contract, ownership, language, framework, and exception guidance for pragmatic implementation and code review. Use when implementing-code-pragmatically or code-review requests shared engineering references."
disable-model-invocation: true
argument-hint: "[python|typescript|vue|effect] [ownership|behavior|shared-gates]"
---

# Engineering Pragmatically

Provide technical guidance to the active workflow. Do not start a second planning, implementation, or review process.

Repository guidance and configured tools own project policy. Prefer repository-native mechanisms and installed versions. Do not derive work or personal policy from the machine, language, or this skill.

Load only references relevant to the affected behavior:

| Condition | Read |
| --- | --- |
| Ownership, boundaries, lifecycle, or architecture is affected | [Ownership and boundaries](reference/ownership.md) |
| Runtime behavior, failures, compatibility, operations, security, or bounded work is affected | [Behavioral contracts](reference/behavior.md) |
| A shared gate or transformation affects multiple callers | [Shared-gate contracts](reference/shared-gates.md) |
| Python behavior or runtime configuration is affected | [Python](reference/python.md) |
| TypeScript or JavaScript behavior is affected | [TypeScript](reference/typescript.md) |
| Vue rendering, reactivity, routing, stores, SSR, or lifecycle is affected | [Vue](reference/vue.md), plus TypeScript when applicable |
| Strict TypeScript or Effect guidance was explicitly selected | [Selected TypeScript and Effect standards](reference/typescript-effect-selected.md) |
| A rule is disputed or its source is requested | [Sources and limits](reference/corpus.md) |

For an uncovered language such as Go, apply the shared ownership, behavior, and shared-gate references plus repository conventions and official documentation for the installed version. State the specialized guidance gap.

Strict TypeScript and Effect guidance is opt-in. Load it only when the user explicitly requests it or repository guidance/configuration explicitly selects it. A direct or transitive dependency does not select stricter standards by itself.

Return to the invoking skill after loading the selected references. That skill owns execution order, completeness, edits, verification, findings, and reporting.
