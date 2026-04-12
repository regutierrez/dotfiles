# Activation Design

Write descriptions that help the agent find the skill without turning the frontmatter into noise.

## Goal

The `description:` field should do three jobs at once:

- Say what the skill does
- Say when to use it
- Say what nearby requests are out of scope when false positives are likely

Keep it natural. The goal is better matching, not keyword stuffing.

## Short Checklist

- Lead with the primary use case in one sentence
- Name the concrete entities, capabilities, or tools the skill handles
- Include user verbs such as `analyze`, `compare`, `generate`, `deploy`, `validate`
- Add `Use when...` or `Use for...` phrasing
- If nearby requests could trigger the skill incorrectly, add 2-3 out-of-scope cases in plain prose
- Keep it specific enough to match real queries, but short enough to scan quickly

## Description Template

```yaml
description: Provides [primary outcome] for [specific domain or artifact].
  Use when [real task 1], [real task 2], or [real task 3].
  Supports [capability 1], [capability 2], and [capability 3].
  Does not cover [nearby but out-of-scope case] or [another out-of-scope case].
```

## Good vs Bad

**Good:**

```yaml
description: Reviews pull requests for correctness, security issues, and test gaps.
  Use when reviewing a PR, diff, or patch before merge. Supports risk-focused
  review of backend, frontend, and infrastructure changes. Does not cover style-only
  formatting passes or commit message rewriting.
```

**Bad:**

```yaml
description: PR review tool, code review, bugs, tests, security, frontend, backend.
```

The bad example contains words, but it does not read like a trigger the agent can reason about.

## Coverage Check

Before finalizing the skill, test the description against likely prompts:

- 3-5 short requests a user would naturally type
- 3-5 alternate phrasings using different verbs or nouns
- 2-3 out-of-scope requests that should not trigger the skill

If a likely request does not match the description, add the missing term naturally.
If an out-of-scope request feels too close, tighten the wording or add a negative example.

## Keep It Lean

- Prefer natural phrases over raw keyword lists
- Mention only the capabilities the skill actually implements
- Avoid repeating synonyms unless they close a real discovery gap
- Put detailed examples in the body or `references/`, not in frontmatter

## See Also

- [frontmatter.md](./frontmatter.md) - YAML spec for the `description:` field
- [progressive-disclosure.md](./progressive-disclosure.md) - Keep discovery guidance small and focused
