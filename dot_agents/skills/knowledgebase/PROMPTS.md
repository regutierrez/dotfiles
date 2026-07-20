# Knowledgebase recurring prompts

Use these as recurring requests with the `knowledgebase` skill. Replace angle-bracket placeholders before running them.

## Capture this agent conversation

```text
Use the knowledgebase skill in capture mode. Extract only durable decisions, fixes, learnings, system explanations, and ongoing context from this conversation. Search for canonical notes before creating anything, add a terse digest to today's capture, promote only material that would be expensive to rediscover, preserve exact identifiers and provenance, and report what you created, updated, or skipped.
```

## Preview a capture without editing

```text
Use the knowledgebase skill in capture review-only mode for this conversation. Propose the smallest useful set of daily and durable-note operations. For each candidate, show its type, target note, merge-or-create operation, evidence, reason it clears the promotion threshold, and proposed incoming link. Do not edit the vault.
```

## Search current understanding

```text
Use the knowledgebase skill to search for our current understanding of <topic>. Start with maps and current durable notes, then consult daily notes and raw sources only if needed. Distinguish canonical understanding, historical evidence, unresolved contradictions, and facts that still require verification from an authoritative repository, ticket, PR, runbook, or official document. Cite the notes you used. Do not edit.
```

## Weekly promotion review

```text
Use the knowledgebase skill in weekly-review mode. Review the seven most recent notes in 00 Capture and propose at most five high-value promotions or merges. Search for an existing canonical owner for each item. Show the destination, merge-or-create operation, why it is expensive to rediscover, and the meaningful incoming link you would add. Do not edit yet.
```

## Apply an approved weekly review

```text
Use the knowledgebase skill to apply only approved weekly-review candidates <numbers or titles>. Re-check for canonical owners, make the smallest edits, add provenance and incoming links, validate the changed notes, and leave every unapproved candidate untouched.
```

## Process a meeting transcript

```text
Use the knowledgebase skill in transcript mode for <transcript text or path>. Put a terse digest in the daily note for <date>. Separate explicit decisions from suggestions, record owners and deadlines only when stated, keep open questions open, and selectively promote only durable decisions, fixes, learnings, or project context. Do not copy the raw transcript into the vault unless I explicitly ask.
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
Use the knowledgebase skill to capture the reusable personal learning from this conversation. Explain it in my own terms, include the smallest memorable example, state why it matters and how I expect to apply it, and connect it to the relevant project, area, or learning map. Keep transient reflection in today's capture rather than forcing it into a permanent note.
```

## Knowledgebase maintenance audit

```text
Use the knowledgebase skill in maintenance mode. Audit <scope> for unlinked current notes, duplicate canonical notes, unresolved links, old drafts, and superseded notes without a clear replacement. Return a compact table with evidence, proposed action, and risk. Do not edit, move, archive, rename, or delete anything until I approve specific actions.
```
