# Code comments

## The idea

Comments explain **why**: the intent behind non-obvious code, the rules that must always hold, the trade-offs, and the evidence behind decisions. They never retell what the code does. Be comment-heavy exactly where the tricky rules live, and silent everywhere else.

## Rules

- **Entry-point modules and new feature packages** get a short design comment (TS) or docstring/README (Python): what the module owns, where its edges are, and what must always hold. Class docstrings describe how the class is meant to be used with other parts — not what the class is.
- **Exported functions** get a short comment saying what they're for. **Typed error classes** also say where they're thrown and where they're caught ("Thrown from X; caught at the Y mutation boundary, which shows a toast").
- **Write the comment about an always-true rule at the place that owns it**, concretely: the order locks must be taken in, why the allow-list has exactly these entries, why the number handling is safe.
- **Back claims with evidence**: ticket IDs, incident references, "verified by probing". The evidence supports the explanation — it never replaces it.
- **Every "carry on anyway" choice says what it protects.** A `.default()`/`.optional()` field says which old stored data it lets through; a fallback says what would break without it.
- **Every escape hatch gets a reason at the spot it happens**: fakes, casts, lint or type suppressions, `# pyright: ignore`.
- **When Python and TypeScript mirror each other, both sides say so** ("Mirrors the BE field on the Python model").
- **Dangerous or experimental code is flagged loudly.**
- **Keep comments short, concrete, and true.** If your change makes a nearby comment wrong, fix or delete it in the same change — wrong comments mislead the next reader.

## Don't

- Don't narrate obvious steps or control flow.
- Don't restate the code in English — good names already do that.
- Small obvious helpers need no comment.
- Don't use section markers (`// helpers`, `# --- utils ---`) as a stand-in for pulling code into a properly named module.
