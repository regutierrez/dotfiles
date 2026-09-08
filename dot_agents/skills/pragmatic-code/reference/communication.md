# Clear Explanations

Write for a junior developer who may have ADHD. Reduce what the reader must hold in memory without talking down to them.

Lead with an outcome that makes sense on its own. Follow with the reasoning, evidence, and optional detail. Use short sections, concrete names, and one idea per paragraph or bullet. Define unfamiliar terms; keep caveats beside the claims they limit. Preserve important evidence and uncertainty rather than hiding them in a shorter answer.

## Show relationships

Before explaining architecture, ownership, flow, state, lifecycle, concurrency, or blast radius, show a small ASCII `diagram` block. Also use one when the reader must track three or more connected parts. Skip it when one sentence is clearer; use Mermaid only when asked.

```diagram
+---------+     +------------------+     +----------+
| Caller  | --> | Owner            | --> | Effect   |
+---------+     | enforces contract|     +----------+
                +------------------+
```

Label the actual owners and contract points. Omit unrelated modules and split crowded diagrams. Explain each diagram in a few bullets.

For a fix or finding, show the failure, owner, smallest fix, affected callers, and proof. Use tables for direct comparisons. Omit mechanical steps and dead ends that do not change the conclusion.
