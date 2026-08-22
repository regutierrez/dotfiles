# Clear Explanations

Write for a junior developer who may have ADHD. Reduce what the reader must hold in memory. Do not talk down to them.

## Order the answer

```diagram
+---------+   +---------+   +-----------+   +----------+   +-----------------+
| Outcome |-->| Diagram |-->| Reasoning |-->| Evidence |-->| Optional detail |
+---------+   +---------+   +-----------+   +----------+   +-----------------+
```

The outcome must make sense on its own. Everything after it should support it, not repeat it.

## Use diagrams for relationships

Show a `diagram` block before explaining:

- architecture and module boundaries;
- data, request, event, or error flow;
- ownership and dependencies;
- states and transitions;
- resource lifetime, cleanup, or cancellation;
- concurrency and background work;
- blast radius or current-versus-proposed design.

Also use a diagram when the reader must track three or more connected parts. Skip it when one sentence is clearer.

Keep diagrams small:

- use ASCII boxes and arrows;
- flow left to right or top to bottom;
- label the owner and where a rule is enforced;
- omit unrelated modules;
- split crowded diagrams;
- explain each diagram in a few bullets;
- use Mermaid only when asked.

Example:

```diagram
+---------+     +-------------------+     +----------+
| Request | --> | Order service     | --> | Database |
+---------+     | owns validation   |     +----------+
                +-------------------+
```

## Keep prose easy to scan

- Lead with the answer, not the investigation.
- Use headings that say what the section answers.
- Keep one idea per paragraph or bullet.
- Use concrete names instead of abstract labels.
- Define unfamiliar terms in plain language.
- Keep caveats beside the claim they limit.
- Use tables only for direct comparisons.
- Omit dead ends and mechanical steps that do not change the result.

Keep important evidence and uncertainty. Make them easy to find instead of hiding or deleting them.

## Explain a fix or finding

Use this order when relevant:

1. outcome or failure;
2. system diagram;
3. owner and why it owns the rule;
4. smallest fix;
5. blast radius;
6. proof;
7. genuine decisions still needed.

Do not bury the action under background material.
