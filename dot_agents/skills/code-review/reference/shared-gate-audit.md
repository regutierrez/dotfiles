# Shared-Gate Review Audit

A shared gate accepts, rejects, filters, normalizes, binds, serializes, authorizes, retries, persists, or executes values for multiple callers. A transformation can alter the copy that validation sees without changing what later executes. Audit the full caller contract, not only the local diff.

Use this procedure when reviewing a change to shared behavior. Evaluate the actual changed path and keep unavailable evidence explicit.

## 1. Map callers and copies

Enumerate production construction and call sites, subclasses, overrides, registrations, callbacks, and configured hooks. Trace original, validation, stored, rebound, regenerated, and execution copies separately. Resolve inherited defaults, feature flags, and conditional producer fragments.

Start at downstream consumers—binders, replacement maps, allowlists, schemas, parameter transformers, and execution adapters—before searching prompts or other producers. A producer-first search only rediscovers names the reviewer already knows and cannot establish completeness.

**Complete when:** every affected caller and copy transition is identified or listed as unresolved. Group callers only after proving identical producers, phase order, and downstream handling.

For every gate, complete this matrix even when there are no symbolic keys:

| Caller | Producer state at gate entry | Expected outcome | Base result | Head result | Later effect/retry | Disposition |
| --- | --- | --- | --- | --- | --- | --- |

Each disposition is confirmed defect, no defect, missing proof, or decision. State written after the gated call is later state, not the producer state at gate entry.

## 2. Inventory and trace exact keys when present

Open downstream binders, allowlists, replacement maps, schemas, and parameter transformers. Record every literal consumer key and generated family before upstream searching. Inspect dynamic construction too; automated extraction alone cannot establish completeness.

Use existing search tools against the review's actual revision or working-tree scope. The bundled Python ledger may use its pinned ast-grep runner as documented; do not install project dependencies.

For Python literal-key consumers, use [shared-gate-ledger.md](shared-gate-ledger.md). For other languages, produce the same evidence manually. Automated extraction does not establish dynamic-key completeness.

For each literal key, in sequence:

1. Run separate fixed-string searches for the bare key and each supported dialect spelling, such as `name`, `:name`, or `@name`. Use `rg -F` or `git grep -F` across the repository source, including imported producers outside the changed directory. Record exclusions or unavailable source.
2. Record query, scope/revision, match count, and disposition of every production match in the search ledger.
3. At the first prompt, template, example, or configuration match, open its definition and trace imports, assembled producers, defaults, and flags. Complete this key's phase trace before moving to the next key.
4. Follow that exact key through the gate, retry feedback, and downstream consumer. Distinguish required pre-gate input from a value inserted after validation.

| Exact key | Query and revision/scope | Match count | Production match dispositions and citations |
| --- | --- | --- | --- |

| Exact key | Reachable producer and default/flag | Producer requirement | Earliest phase | Separate post-gate insertion | Gate result | Downstream consumer | Retry satisfiable? |
| --- | --- | --- | --- | --- | --- | --- | --- |

Every producer or insertion citation must contain the exact key in its row. A sibling key's insertion, common prefix, shared binder, or absence of a local match does not establish phase. A binder consumes a value; only an insertion statement establishes post-gate creation. Do not classify an entire reserved-key family as post-gate from evidence for only some members.

Treat reachable prompt/template occurrences as pre-gate producers until tracing disproves that path. A SQL placeholder in an imported prompt remains a producer candidate even when neighboring content looks like metadata or another prompt forbids the same name as a filter. Quote enough assembled prompt context to classify each key as **required**, **allowed**, **forbidden**, or **conditional**. “Prompt mentions,” “binder only,” “reserved name,” and “same as above” are not dispositions.

Use one row per literal key. Group generated families only after proving their members share producer and phase. Required cells must contain evidence, a reasoned not-applicable disposition, or explicit unresolved uncertainty.

**Complete when:** every consumer key has a search and phase row. Report consumer-key count, searched-key count, and `consumer keys − searched keys`; the difference must be empty for a completeness claim. If consumers have no symbolic/literal keys, explain why this step is not applicable instead of inventing a key inventory. If the required ledger or inventory tool fails, diagnose it and withhold the shared-gate safety verdict unless equivalent complete evidence is produced and explicitly reconciled against the consumer set.

## 3. Audit erasure and both failure directions

For each validation-time transformer, locate the declaration or allowlist that makes input legitimate. Trace declared and undeclared values through fallback branches and compare the validation copy with what is stored or executed.

- **False acceptance:** an invalid, undeclared, or unauthorized value disappears from validation but survives into later execution, or is otherwise accepted incorrectly.
- **False rejection:** a legitimate required, deferred, framework-owned, or runtime-bound value is rejected before its owner can handle it.

Compare retry feedback with producer instructions. A producer required to emit a key that the gate forbids cannot satisfy both contracts merely by regenerating output.

For every proposed regression, compare the same trigger at the base revision. Rejection by a new gate is not itself a regression when the base already rejected that invalid input later and regeneration can produce a contract-valid form. Record whether the diff breaks a previously valid path, only changes failure timing, or materially worsens the caller-visible error contract.

**Complete when:** every transform has an erasure disposition, both failure directions have been examined, and retry compatibility is supported or explicitly unresolved. Finding one direction does not waive the other.

## 4. Reconcile caller contracts and proof

| Caller or proven contract class | Value and producer | Phase introduced | Copy checked/transformed | Gate handling | Stored/execution handling | Expected outcome | Compatibility proof or gap |
| --- | --- | --- | --- | --- | --- | --- | --- |

Cover each distinct contract row with caller-visible compatibility evidence. An implementation needs a compatibility test for each distinct row; a parameterized test may cover several. A review names absent evidence without modifying tests. Testing only a new rejection rule is incomplete when callers also rely on allowed, deferred, transformed, or runtime-bound values.

Include the caller matrix and, when applicable, the exact-key search ledger, phase table, and parity counts in the report. Keep them compact but preserve evidence; file lists are not substitutes. Report confirmed defects even if another path remains unresolved, while withholding a blanket safety verdict.

**Complete when:** every caller, state, key, production match, transform, diagnostic field, and required matrix cell has a disposition, and every safety claim has compatibility evidence. Reconcile each defect disposition into findings and every unresolved disposition into missing proof or decisions. Otherwise limit the conclusion; a completed-looking inventory is not a verdict.
