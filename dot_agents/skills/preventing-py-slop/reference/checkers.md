# Deterministic Checker Ownership

Use established analyzers whenever they can decide a rule from syntax or type semantics. Treat the codes below as candidates, not a preset. Confirm them against the repository's installed versions and inspect representative findings before enabling them.

## Ownership matrix

| Concern | Deterministic owner | Agent review still decides |
| --- | --- | --- |
| Blanket, stale, or invalid suppressions | Ruff `PGH003`, `PGH004`, `RUF100`, and version-dependent `RUF102`; Basedpyright `reportIgnoreCommentWithoutRule`, `reportUnnecessaryTypeIgnoreComment` | Whether a narrow suppression documents a real tool limitation |
| `Any` and unknown propagation | Basedpyright `reportAny`, `reportExplicitAny`, `reportUnknownArgumentType`, `reportUnknownLambdaType`, `reportUnknownMemberType`, `reportUnknownParameterType`, `reportUnknownVariableType` | Whether dynamism belongs at the boundary and what precise contract should replace it |
| Cast misuse | Basedpyright `reportInvalidCast`, `reportUnnecessaryCast` | Whether one necessary cast is backed by a runtime invariant; nested casts still require semantic review |
| Missing or weakened contracts | Basedpyright `reportMissingParameterType`, `reportMissingTypeArgument`, `reportReturnType`, `reportArgumentType`, `reportAssignmentType`, `reportTypedDictNotRequiredAccess`, and `reportOptional*` access diagnostics | Which values require runtime validation and which model represents the domain |
| Detectable broad or swallowed failures | Ruff `E722`, `BLE001`, `S110`, `S112`, `B012`, selected `TRY` rules | Whether a catch is a legitimate containment boundary and whether its fallback is observable; these rules do not prove observability generally |
| Weak exception tests | Ruff `PT011`, `PT012`, `PT017` | Whether the test proves the externally meaningful failure contract |
| Dead or unused code | Ruff `F401`, `F841`, `ARG001`–`ARG005`; Basedpyright `reportUnusedClass`, `reportUnusedFunction`, `reportUnusedImport`, `reportUnusedParameter`, `reportUnusedVariable` | Whether apparent dead code is a framework hook or public API |
| Detectable unowned async results | Ruff `RUF006`; Basedpyright `reportUnusedCoroutine`, selectively `reportUnusedCallResult` | Who owns task errors, cancellation, shutdown, and transferred resources; `RUF006` covers recognized task-creation calls only |
| Detectable blocking calls in async code | Relevant Ruff `ASYNC` rules available in the installed release, commonly `ASYNC210`, `ASYNC220`, `ASYNC221`, `ASYNC230`, and `ASYNC251` | Whether execution is actually on an event loop or deliberately offloaded |
| Detectable file and resource closure | Ruff `SIM115` and relevant `ASYNC` rules | Ownership across factories, generators, callbacks, cancellation, and APIs the rules do not recognize |
| Mutable or eager defaults | Ruff `B006`, `B008`, `RUF012`; Basedpyright `reportCallInDefaultInitializer` where useful | Whether construction timing and shared state are intentional |
| Impossible or redundant states | Basedpyright `reportUnreachable`, `reportUnnecessaryComparison`, `reportUnnecessaryContains`, `reportUnnecessaryIsInstance`, `reportUnusedExcept`, `reportMatchNotExhaustive` | Whether the type contract matches runtime reality and whether a fallback hides corrupt input |
| Unsafe object contracts | Basedpyright `reportIncompatibleMethodOverride`, `reportIncompatibleVariableOverride`, `reportIncompatibleUnannotatedOverride`, `reportUninitializedInstanceVariable`, `reportUnsafeMultipleInheritance` | Whether inheritance or lifecycle complexity should be removed rather than annotated around |
| Private or excessive mocking | None reliable enough for blocking enforcement | Whether the patch targets a stable boundary and whether the test asserts behavior rather than choreography |
| Needless abstraction | None reliable enough for blocking enforcement | Whether direct code would preserve ownership and behavior more clearly |

## Ruff rollout

Run Ruff directly through the repository's package manager and task runner. Query every proposed code against the installed release with `ruff rule <CODE>` before sampling or editing configuration. Rule availability differs across pinned releases.

Start with independently useful codes rather than broad selector families. A practical sampling order is:

1. Suppressions: `PGH003`, `PGH004`, `RUF100`.
2. Silent failures: `E722`, `S110`, `S112`, then sample `BLE001` because containment boundaries may be numerous.
3. Async and resources: `RUF006`, `SIM115`, then only installed `ASYNC` codes matching the project's async framework and execution model.
4. Tests: `PT011`, `PT012`, `PT017` when pytest is used.
5. Defaults and shared state: `B006`, `B008`, `RUF012`.
6. Narrow `TRY`, `SIM`, `ARG`, and unused-code rules after sampling their fixes for semantic changes and framework false positives.

Use `ruff check --extend-select <CODES>` for sampling. Do not use `--select` unless intentionally replacing configured selections; replacing them can make existing `noqa` comments appear unused through `RUF100`.

Do not create a count-based Ruff baseline. Ruff does not provide a native baseline. For a repository with debt:

- enable a rule first in a clean project, package, or path;
- expand scope as findings are removed;
- use the repository's existing changed-file mechanism only when its file-level behavior is understood;
- reserve `per-file-ignores` for stable structural exceptions;
- never spray source-level `noqa` to imitate a baseline.

## Basedpyright rollout

Preserve an established type checker. When Basedpyright is new, start from `typeCheckingMode = "recommended"`, the repository's actual Python version and platform, and explicit include and exclude roots. Recommended mode is broad and fails the CLI on warnings. Exact defaults and severities vary by release, so inspect the installed version, explicitly configure selected policy diagnostics, and sample the first run before adoption.

Prioritize these diagnostics when tightening an existing configuration:

- type evidence: `reportAny`, `reportExplicitAny`, every relevant `reportUnknown*`, `reportInvalidCast`, `reportUnnecessaryCast`;
- suppression hygiene: `reportIgnoreCommentWithoutRule`, `reportUnnecessaryTypeIgnoreComment`;
- contracts: `reportMissingParameterType`, `reportMissingTypeArgument`, `reportReturnType`, `reportArgumentType`, `reportAssignmentType`, `reportTypedDictNotRequiredAccess`, `reportOptionalCall`, `reportOptionalContextManager`, `reportOptionalIterable`, `reportOptionalMemberAccess`, `reportOptionalOperand`, `reportOptionalSubscript`;
- ownership: `reportUnusedCoroutine`, then sample `reportUnusedCallResult`;
- impossible states: `reportUnreachable`, `reportUnnecessaryComparison`, `reportUnnecessaryContains`, `reportUnnecessaryIsInstance`, `reportUnusedExcept`, `reportMatchNotExhaustive`;
- object safety: override, initialization, and multiple-inheritance diagnostics from the matrix.

For existing debt, use Basedpyright's native baseline:

```bash
basedpyright --writebaseline
basedpyright
```

Before writing a baseline, require a clean worktree, run Basedpyright normally, and review every unbaselined diagnostic that will become debt. `--writebaseline` records all of them, not only findings from the rule being adopted. Commit `.basedpyright/baseline.json` or the configured `baselineFile` only after reviewing its diff and counts, and never write it in CI.

Baseline entries match by relative file, diagnostic rule, and column rather than complete source identity. New or moved code at the same column can therefore inherit an old baseline entry. Automatic removal also depends on baseline mode and whether the run analyzed the complete project. Configure CI locking deliberately, review baseline diffs, and treat the baseline as an incremental-adoption aid rather than a guarantee against new debt.

## Custom checker threshold

This skill does not bundle a custom checker. Adversarial trials showed that deciding whether nested casts resolve to the imported runtime function requires modeling Python evaluation order, deferred execution, rebinding, wildcard imports, type-parameter scopes, generators, and control flow. A partial model is less trustworthy than leaving the concern to Basedpyright and review.

Do not add a custom rule until all are true:

1. Ruff and the configured type checker cannot express it.
2. Syntax or type semantics can decide it without architecture guesses.
3. Representative valid and invalid examples produce a clear boundary.
4. Aliases, shadowing, exclusions, malformed files, evaluation order, and supported Python versions have adversarial tests.
5. The rule found a concrete problem in a real repository without a large false-positive set.

## Sources

- [Ruff rules](https://docs.astral.sh/ruff/rules/)
- [Basedpyright configuration and diagnostics](https://docs.basedpyright.com/latest/configuration/config-files/)
- [Basedpyright native baselines](https://docs.basedpyright.com/latest/benefits-over-pyright/baseline/)
