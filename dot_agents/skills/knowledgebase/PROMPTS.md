# Knowledgebase recurring prompts

Use these as recurring requests with the `knowledgebase` skill. Replace angle-bracket placeholders before running them.

## Capture this agent conversation

```text
Use the knowledgebase skill in capture mode for this conversation.
```

## Preview a capture without editing

```text
Use the knowledgebase skill in capture review-only mode for this conversation. Propose the smallest useful set of note operations. For each candidate, show its type, target, operation, evidence, promotion rationale, and proposed incoming link. Do not edit the vault.
```

## Search current understanding

```text
Use the knowledgebase skill in search mode for our current understanding of <topic>. Do not edit.
```

## Weekly promotion review

```text
Use the knowledgebase skill in weekly-review mode. Propose candidates only; do not edit.
```

## Apply an approved weekly review

```text
Use the knowledgebase skill to apply only approved weekly-review candidates <numbers or titles>. Leave every unapproved candidate untouched.
```

## Process a meeting transcript

```text
Use the knowledgebase skill in transcript mode for <transcript text or path>, dated <date>. Do not copy the raw transcript into the vault unless I explicitly ask.
```

## Capture an architectural decision

```text
Use the knowledgebase skill to capture the architectural decision from this conversation. Preserve the context, exact decision, constraints, alternatives considered, consequences, revisit conditions, authoritative links, and unresolved questions. Search for an existing decision or owning system note first; update it instead of duplicating it. Do not present a proposal as an accepted decision.
```

## Capture a difficult fix or RCA

```text
Use the knowledgebase skill to capture the fix from this conversation. Preserve exact symptoms, errors, identifiers, reproduction conditions, causal chain, misleading evidence, fix, commands or paths, and actual verification. Separate confirmed root cause from hypotheses and unfinished validation. Update the existing canonical fix or system note when one owns the topic.
```

## Capture a personal learning

```text
Use the knowledgebase skill to capture the reusable personal learning from this conversation. Explain it in my own terms, include the smallest memorable example, state why it matters and how I expect to apply it, and connect it to the relevant project, area, or learning map.
```

## Knowledgebase maintenance audit

```text
Use the knowledgebase skill in maintenance mode for <scope>. Return a compact table with evidence, proposed action, and risk. Do not change notes until I approve specific actions.
```
