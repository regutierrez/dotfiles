# Visual workflows

Select one mode. Gather evidence first, then publish a small sequence of Sideshow cards. Do not omit important source material merely to fit one card; split it.

## Diagram

1. Identify the relationship being explained and the audience's likely question.
2. Choose Mermaid for connected structure, Markdown for hierarchy or comparison, and HTML/SVG only for bespoke spatial or interactive work.
3. For a large system, publish an overview first, then one card per subsystem or concern.
4. Pair the visual with a short Markdown legend only when labels cannot carry the meaning cleanly.

## Visual plan

Research the codebase before proposing changes. Cover:

1. goal, user outcome, scope, and non-goals;
2. current state and first divergence from the desired behavior;
3. proposed architecture, ownership boundaries, and data/control flow;
4. ordered implementation phases and dependencies;
5. likely files and contracts to change;
6. risks, edge cases, migration or compatibility concerns;
7. tests, validation, and acceptance criteria;
8. unresolved decisions owned by the user.

Recommended session: Markdown goal/scope, Mermaid current state, Mermaid or HTML proposed design, Markdown phases/file map, then risks and acceptance.

## Slides

Slides are opt-in only.

1. Inventory every source section and required point before authoring.
2. Build a narrative arc: impact, context, deep dive, resolution.
3. Give each slide one focal point and vary composition between consecutive slides.
4. Split dense content rather than shrinking it or silently omitting it.
5. Use the active Sideshow slides kit when available. Otherwise prefer a sequence of titled cards; use custom HTML only if a deck interaction is required.
6. Test navigation, reduced motion, and stable auto-height when using an interactive deck.

## Diff review

Determine the requested comparison exactly. Inspect the complete changed files and surrounding contracts before reviewing.

Publish:

1. concise intent and scope, with verified file/line counts where useful;
2. current architecture or changed flow as Mermaid/HTML;
3. the actual patch as a native `diff` part;
4. evidence-backed findings ordered by severity with file and line references;
5. test/docs impact, non-obvious coupling, and follow-up decisions.

Do not infer rationale as fact. Label recovered rationale, code-based inference, and unknown rationale distinctly.

## Plan review

Verify every named file, symbol, behavior, dependency, and validation command against the current codebase.

Cover:

1. verdict and strongest evidence;
2. accurate current-state architecture;
3. proposed-state fit and ownership boundaries;
4. stale or incorrect assumptions;
5. missing edge cases, migrations, tests, or operational work;
6. corrected file-level sequence;
7. decisions that still require user input.

Use `code` surfaces when available for disputed contracts; otherwise use concise fenced excerpts in Markdown with source line references.

## Recap

Rebuild a returning developer's mental model from evidence:

1. project identity and purpose;
2. current branch, working state, recent history, and active work;
3. architecture and key entry points;
4. important invariants and non-obvious coupling;
5. open TODOs, risks, and likely next steps.

Use Markdown for identity/state, Mermaid for architecture, terminal parts for useful git output, and code excerpts only for load-bearing entry points. Never invent intent from an unexplained diff.

## Fact-check

1. Extract objective claims from the target card, plan, review, or document.
2. Verify each claim against source, tests, history, or authoritative docs.
3. Classify each as verified, corrected, unsupported, or unverifiable.
4. Publish a compact evidence matrix.
5. Update the original card when its identity is known; preserve version history instead of publishing a corrected duplicate.
6. Clearly label unresolved uncertainty.

## Share

Return the session or card URL from Sideshow. State whether it is local-only or remotely accessible under the server's public-read configuration. Never deploy standalone HTML or expose authentication tokens.
