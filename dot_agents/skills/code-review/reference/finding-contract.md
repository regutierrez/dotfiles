# Review Findings

Report findings that change an engineering or product decision. A suspicious pattern or diagnostic is a lead, not a verdict.

Coverage inventories are inputs to judgment, not conclusions. Every required caller, state, representation, and diagnostic-field row must end as a confirmed defect, no defect, missing proof, or decision. Evidence that contradicts the verdict cannot remain only in a coverage table.

## Must fix

An accepted defect needs:

1. the contract that should hold;
2. a reachable trigger and code-path evidence;
3. concrete caller or user impact, including affected consumers;
4. the owner and smallest safe fix;
5. proof that could confirm the fix;
6. compatibility or rollback effects when relevant.

Explain why the fix preserves intended behavior. Use one short paragraph for a local defect and the full causal chain for a cross-module, lifecycle, or migration issue.

Before accepting a concern, check earlier parsing, validation, authorization, normalization, type and framework guarantees, caller limits, cleanup, compatibility tests, and intentional behavior. Language references identify additional ways a suspicion can be disproved.

Establish the actual producer representation before treating a tested branch as representative. Numeric IDs, numeric strings, opaque IDs, nulls, legacy forms, and union variants may normalize or branch differently; evidence for one form does not cover another.

Claims of permanent loss, absent retry, or no recovery require tracing every reachable polling source, watcher, rendered child component, emitted event, callback, retry owner, and terminal-state transition. A possible reactive interleaving is missing proof until framework semantics or a focused test establishes it. Report temporary degradation separately from terminal loss.

For a regression finding, establish the counterfactual at the comparison base for the same reachable trigger. A new earlier rejection is not enough: show that the trigger was valid and succeeded before the diff, or that the diff materially worsens a caller-visible outcome or error contract. If the base already rejected the input and retry can produce contract-valid output, classify it as pre-existing invalid behavior rather than a regression. Distinguish “the gate rejects this output sooner” from “the gate makes a previously valid caller contract impossible.”

For diff reviews, tie findings to behavior introduced, newly reached, or materially worsened by the change. An unchanged pre-existing violation does not become a regression merely because the requested invariant is broad. Call an incomplete migration a defect only when the diff claims or structurally owns complete migration of that consumer class. For snapshot reviews, tie findings to the requested path. Keep unrelated cleanup, style preferences, hypothetical consumers, and unsupported future-proofing out of the defect list.

## Decision needed

Use for a genuine product, domain, accessibility, policy, compatibility, or rollout choice that code cannot settle. State the question, viable options and effects, who or what can decide, and whether work can continue safely. An engineering preference alone is not a product decision.

## Missing proof

Name the affected contract, the unresolved factual claim, and the test or inspection needed. Missing proof is not a weaker label for a causal path already established from source. When the changed path previously exposed a diagnostic, the new path blocks that renderer, and no remaining renderer on the same reachable path consumes that field or an intentionally equivalent fallback, report the observable regression; another route that a user could navigate to is not equivalent presentation. Missing coverage does not prove a runtime defect. Keep verified findings even when other paths remain unresolved, but withhold a safety claim for those paths.

## Output

Lead with accepted findings, highest impact first. Give file and line evidence, trigger, consequence, owner, smallest fix, and proof. Show the causal chain clearly when it crosses modules, processes, lifecycle stages, or deployment steps.

Then include only applicable sections: decisions needed, automated diagnostics, uncertainty and unverified areas, checks run, and verdict. If there are no findings, say so and state coverage limits. The verdict must not imply that an unrun check passed.

Coverage and finding quality are independent. A complete inventory does not prove a concern, and one confirmed defect does not prove the remaining surface was reviewed. State both separately.
