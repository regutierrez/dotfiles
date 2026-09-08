# Shared-Gate Audit

A shared gate accepts, rejects, filters, normalizes, binds, serializes, authorizes, retries, persists, or executes values for multiple callers. A transformation can alter the copy that validation sees without changing what later executes. Audit the full caller contract, not only the local diff.

Use this procedure when that shared behavior changes. In plan mode, map current contracts and proposed outcomes, then specify compatibility tests. In review or implement mode, evaluate the actual changed path. Keep unavailable evidence explicit in every mode.

## 1. Map callers and copies

Enumerate production construction and call sites, subclasses, overrides, registrations, callbacks, and configured hooks. Trace original, validation, stored, rebound, regenerated, and execution copies separately. Resolve inherited defaults, feature flags, and conditional producer fragments.

**Complete when:** every affected caller and copy transition is identified or listed as unresolved. Group callers only after proving identical producers, phase order, and downstream handling.

## 2. Inventory and trace exact keys when present

Open downstream binders, allowlists, replacement maps, schemas, and parameter transformers. Record every literal consumer key and generated family before upstream searching. Inspect dynamic construction too; automated extraction alone cannot establish completeness.

Use existing search tools against the review's actual revision or working-tree scope. This reference requires no scanner installation or automatic downloads.

For each literal key, in sequence:

1. Run separate fixed-string searches for the bare key and each supported dialect spelling, such as `name`, `:name`, or `@name`. Use `rg -F` or `git grep -F` across the repository source, including imported producers outside the changed directory. Record exclusions or unavailable source.
2. Record query, scope/revision, match count, and disposition of every production match in the search ledger.
3. At the first prompt, template, example, or configuration match, open its definition and trace imports, assembled producers, defaults, and flags. Complete this key's phase trace before moving to the next key.
4. Follow that exact key through the gate, retry feedback, and downstream consumer. Distinguish required pre-gate input from a value inserted after validation.

| Exact key | Query and revision/scope | Match count | Production match dispositions and citations |
| --- | --- | --- | --- |

| Exact key | Reachable producer and default/flag | Earliest phase | Separate post-gate insertion | Gate result | Downstream consumer | Retry satisfiable? |
| --- | --- | --- | --- | --- | --- | --- |

Every producer or insertion citation must contain the exact key in its row. A sibling key's insertion, common prefix, shared binder, or absence of a local match does not establish phase. A binder consumes a value; only an insertion statement establishes post-gate creation.

Treat reachable prompt/template occurrences as pre-gate producers until tracing disproves that path. A SQL placeholder in an imported prompt remains a producer candidate even when neighboring content looks like metadata. “Prompt mentions,” “binder only,” and “same as above” are not dispositions.

Use one row per literal key. Group generated families only after proving their members share producer and phase. Required cells must contain evidence, a reasoned not-applicable disposition, or explicit unresolved uncertainty.

**Complete when:** every consumer key has a search and phase row. Report consumer-key count, searched-key count, and `consumer keys − searched keys`; the difference must be empty for a completeness claim. If consumers have no symbolic/literal keys, explain why this step is not applicable instead of inventing a key inventory.

## 3. Audit erasure and both failure directions

For each validation-time transformer, locate the declaration or allowlist that makes input legitimate. Trace declared and undeclared values through fallback branches and compare the validation copy with what is stored or executed.

- **False acceptance:** an invalid, undeclared, or unauthorized value disappears from validation but survives into later execution, or is otherwise accepted incorrectly.
- **False rejection:** a legitimate required, deferred, framework-owned, or runtime-bound value is rejected before its owner can handle it.

Compare retry feedback with producer instructions. A producer required to emit a key that the gate forbids cannot satisfy both contracts merely by regenerating output.

**Complete when:** every transform has an erasure disposition, both failure directions have been examined, and retry compatibility is supported or explicitly unresolved. Finding one direction does not waive the other.

## 4. Reconcile caller contracts and proof

| Caller or proven contract class | Value and producer | Phase introduced | Copy checked/transformed | Gate handling | Stored/execution handling | Expected outcome | Compatibility proof or gap |
| --- | --- | --- | --- | --- | --- | --- | --- |

Cover each distinct contract row with caller-visible compatibility evidence. An implementation needs a compatibility test for each distinct row; a parameterized test may cover several. A review names absent evidence without modifying tests. Testing only a new rejection rule is incomplete when callers also rely on allowed, deferred, transformed, or runtime-bound values.

Include the caller matrix and, when applicable, the exact-key search ledger, phase table, and parity counts in the report. Keep them compact but preserve evidence; file lists are not substitutes. Report confirmed defects even if another path remains unresolved, while withholding a blanket safety verdict.

**Complete when:** every caller, key, production match, transform, and required matrix cell has a disposition, and every safety claim has compatibility evidence. Otherwise name the missing proof and limit the conclusion.
