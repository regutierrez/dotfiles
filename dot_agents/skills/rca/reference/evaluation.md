# Evaluate investigation quality, not writing volume

Read only when evaluating or changing this skill. This is not extra work during an investigation.

Use fixed evidence bundles with known source revisions, runtime records, and expected conclusions. Keep answer keys out of the model's investigation prompt. Run the same cases before and after a change with comparable model and tool settings, and record the model and skill revision with each result. Repeat runs where useful to distinguish reliable behavior from one lucky answer.

## Cases

1. **Successful work, failed completion.** Templated execution returns valid output, but a misplaced `break` makes a repair loop's `else` assign an error. Include a competing guard elsewhere in the path. Expect the first assignment to be identified, not the later raise or the competing guard.
2. **Old string, new cause.** Historical logs show the same error text, but a newer diff makes its failure branch reachable on success. Expect the age of the string to be distinguished from the onset of the mechanism.
3. **Moving release.** The current release contains a fix absent from the request's revision. Expect diagnosis against the request revision, with the current-release state reported as a separate conclusion.
4. **Representation mismatch.** Display code and executable code are both strings, and a display transformation changes execution. Expect a contract and replay warning if fix design is requested — never an unsafe field substitution.
5. **Insufficient evidence.** Incomplete logs and two viable failure sites with no decisive runtime state. Expect an unknown or an explicitly qualified hypothesis plus one discriminating next check, not a fabricated cause.
6. **Attempt contamination.** The first model succeeds at execution but fails completion; a later fallback has a data or compiler error. Expect per-attempt attribution.
7. **Unavailable revision.** The incident revision is not the tip of any available worktree and no revision-pinned read resolves. Expect an explicit statement of which revision was inspected and a conclusion scoped to it — not a working-tree read presented as incident evidence.
8. **Intervention without proof.** A fix is merged and deployed, and the symptom has not recurred, but the original trigger was never replayed. Expect partial closure with the missing original-surface validation named, not a closed verdict.

TRI-7321 can supply case 1's regression example: the September 5 request revision had success cleanup and `break` only in the non-templated branch, and the error assignment was the loop `else` despite a valid last render card. That is an example, not a default diagnosis for similar reports.

## Score each case

- Correct incident revision, honestly qualified, with service and attempt correlation.
- Correct causal trigger, failure assignment, propagation, and display mapping. A shared assignment does not imply a shared trigger.
- Distinguishing evidence rather than merely relevant citations.
- Executed-check artifacts, revisions, assertions, and outputs retained; application code distinguished from simplified models; claimed boundaries actually reached.
- Mechanism, activation trigger, and impact confidence separated.
- Returned evidence reduced, projected, and carrying provenance — no raw envelopes or unbounded result sets pulled into context.
- A resolution handoff that names the broken invariant and an acceptance check **without designing a patch**.
- If fix design was separately requested: downstream contracts traced, and a test that fails before and passes after.

Hard failures: invented evidence; a confirmed cause with an unobserved necessary condition; ignoring a contradictory result; attributing fallback evidence to an earlier attempt; presenting a working-tree read as incident-revision evidence; proposing an unsafe representation substitution; proposing a fix that was not requested; or any write beyond the requested MDX writeup.

Mechanical checks can validate frontmatter, relative links, required sections, and revision labels. They cannot certify causality. A fluent report or a green Astro build is not an investigation-quality score.
