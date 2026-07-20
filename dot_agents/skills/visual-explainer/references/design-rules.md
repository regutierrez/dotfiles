# Design rules

The live Sideshow design guide is the source of truth. These rules preserve the useful visual reasoning from visual-explainer without carrying over its standalone page machinery.

## Start with the idea

Before composing, state the one thing the audience should understand or decide. Make that the first card's visual anchor. Supporting detail belongs in later cards.

Choose a visual form because it matches the relationship:

- topology or dependency → Mermaid graph;
- ordered interaction → sequence or flow diagram;
- alternatives or audit → Markdown table or paired HTML panels;
- chronology → timeline, trace, or ordered cards;
- status or metrics → compact HTML/SVG dashboard;
- code change → native diff plus brief rationale;
- raw structured evidence → native JSON/code when available, otherwise Markdown or terminal.

## Structure and density

- One concept per card.
- Use overview → detail for complex systems.
- Around 15 meaningful diagram elements is a signal to split.
- Keep node labels short; put explanation beside the diagram, not inside every node.
- Use headings, spacing, and alignment before adding decoration.
- Do not shrink text to rescue an overloaded layout.
- Preserve all required source points by adding cards or slides, not by cramming.

## Mermaid

- Default to `flowchart TD` or `TB` for card readability.
- Use `LR` only for a short, genuinely linear pipeline.
- Group layers with `subgraph` rather than stretching one row across the card.
- Use simple node IDs, quote labels with punctuation, and wrap with `<br/>`.
- Let Sideshow own colors, theme, and fullscreen behavior.
- Do not embed a Mermaid CDN, custom renderer, zoom shell, or theme initialization.

## HTML and SVG

- Use HTML only when native parts cannot express the concept well.
- Send a body fragment and use the active guide's theme variables and utilities.
- Keep layout in normal flow. Use grid stacking for overlap.
- Set `min-width: 0` on grid/flex children and allow long text to wrap.
- Avoid fixed heights unless the current contract explicitly requires one.
- Prefer inline SVG with a responsive `viewBox` for bespoke diagrams.
- Respect reduced motion; interaction must not be required to understand the core message.

## Visual taste

- Flat, clean, and specific to the content.
- Sentence case for headings and labels.
- Two font weights at most.
- No gradients, shadows, emoji, glassmorphism, or decorative hero filler.
- Use semantic color sparingly for meaning such as added/removed, healthy/risky, or current/proposed.
- Never hardcode colors; dark mode is mandatory.

## Evidence and accessibility

- Every technical claim should trace to a file, line range, command result, or authoritative source.
- Clearly distinguish fact, inference, and open question.
- Give images useful alt text and captions.
- Do not communicate status by color alone; pair it with text or shape.
- Keep text readable at the normal card width and verify wide diagrams remain useful before fullscreen.

## Final visual check

Ask:

1. Is the main idea obvious from the first card?
2. Did each surface use the most native representation available?
3. Can any overloaded card be split?
4. Are labels, citations, and uncertainty accurate?
5. Does HTML remain readable in both themes and normal flow?
6. Is the result useful without animation or interaction?
