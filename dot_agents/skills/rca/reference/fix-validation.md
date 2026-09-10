# Intervention validation and requested fix design

Two distinct jobs. The first belongs in an RCA whenever an intervention already happened. The second happens only when a later turn explicitly asks for it.

## Part A — validating an intervention that already occurred

An RCA is a living causal record, not a diagnosis frozen before implementation. This run can evaluate only interventions that already happened. When validation requires a future intervention, leave the document open with a validation plan for a later turn.

State a falsifiable hypothesis first: if the mechanism is correct, this specific intervention should produce a named observable change **while the original trigger remains present**.

If a fix, refresh, reload, configuration change, or deploy has already occurred:

1. Record the last confirmed failure, the intervention's identity and time, and the first confirmed success.
2. Replay the original workflow on the same surface, entity, request shape, and environment whenever safe. Preserving the trigger is what separates a proven mechanism from a workaround; removing it proves only the workaround.
3. Capture comparable before and after evidence, and tie the running build, configuration, or data version to the intervention.
4. Treat absence of recurrence as supporting evidence only when the observation window and eligible traffic are known.
5. Record closure on separate dimensions:
   - **Intervention status** — not started, implemented, or deployed and active.
   - **Mechanism validation** — not tested, contradicted, supported, or validated.
   - **Original-surface validation** — not attempted, blocked, failed, or passed.
   - **Overall closure** — open, partially closed, closed, or reopened.
6. Revise the mechanism, confidence, scope, and residual gaps when the result refines or contradicts the earlier theory.

A merged pull request, a completed deployment, a refreshed cache, a passing focused test, or a Resolved issue status is not by itself proof that the original symptom is fixed. Overall closure is **closed** only when the intervention is active, the predicted mechanism-level observable changed, and the original trigger succeeded on the original surface or an explicitly justified faithful equivalent.

## Part B — fix design, only when separately requested

An investigation is complete without proposing a patch. Do not enter this section on your own initiative.

When asked, first establish whether the problem is a real requirement violation or whether the behavior should simply be removed or simplified. Then, before recommending any change:

1. Explain how it prevents the demonstrated failure, naming the causal condition it changes.
2. Inspect existing fixes and tests on the default and affected release branches. Prefer an applicable existing correction over inventing another; verify cherry-picks by reading the code, not by ancestry alone.
3. Separate incident repair, workaround, observability improvement, and architectural cleanup. Do not bundle them.
4. Trace changed values through producer → transformations → serialization and persistence → consumers. Identify contracts and old stored data.
5. Name a regression check that fails before the fix and passes after, plus a boundary where genuine failures must still fail.

### Field and representation changes

Similar names or types do not imply equivalent meaning. Establish whether each value is raw, transformed, display-only, serialized, executable, or a cache reference.

- A display representation must not replace executable persisted code without proof of equivalent replay behavior.
- Check every reader, including legacy services, refresh and replay jobs, history reconstruction, and UI classification based on field presence.
- Test the consumer's actual contract. "A string was persisted" does not prove that refreshing the saved artifact still works.
- Preserve compatibility deliberately; do not drop old-data readers merely because new writers stop emitting that form.
- Do not rename or reuse a field to avoid a distinction the domain requires.

For each justified candidate give the owning service and function, the revision-specific location, the behavior changed, the acceptance and regression test, and the concrete risks. Rank by correctness, then scope. Do not manufacture a candidate for every layer.

Implement only with explicit authorization, in a dedicated worktree branched from the requested target — do not default to staging as the base for a production fix. Follow the repository's guidance and the `/tdd` skill: demonstrate the regression, make the smallest correction, run focused checks, and report actual test counts and untested boundaries. Pull requests, data writes, and deployments each require their own authorization.
