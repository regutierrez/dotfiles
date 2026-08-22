# Sources, Synthesis, and Limits

Use these sources to test a rule, not to copy one project's local style. A general rule needs a language or framework reason, a reachable failure it prevents, practical exceptions, and a cheaper alternative when one exists.

The repository revisions below were inspected on 2026-08-22. Branch-tip revisions are evidence snapshots, not release-version guarantees. Always check the target repository's installed versions and local rules.

## Personal skill baseline

Source: the personal [Amp User Skills repository](https://ampcode.com/git/@regutierrez/-/skills) at `cd38f17c97c7072a4a91c0acaffd4a540b15bc43`.

Files read completely:

- `reviewing-python/SKILL.md`
- `reviewing-python/reference/architecture-standard.md`
- `reviewing-python/reference/communication.md`
- `reviewing-python/reference/corpus.md`
- `reviewing-python/reference/finding-contract.md`
- `reviewing-python/reference/independent-review.md`
- `reviewing-python/reference/pragmatic-fixes.md`
- `reviewing-python/reference/review-lenses.md`
- `install-anti-slop/SKILL.md`
- `install-anti-slop/scripts/install.mjs`
- generic and Effect Oxlint rule metadata under `install-anti-slop/assets/anti-slop/`

Adopted:

- state the invariant and verify the problem before changing code;
- find the narrowest owner and map affected callers;
- prefer deletion or an owner-level fix;
- prove caller-visible behavior;
- apply only relevant review lenses;
- use at most one independent judgment reviewer for material risk;
- let the main agent verify findings and own the verdict;
- keep explanations short and diagram relationships before prose.

Tooling boundary:

- `install-anti-slop` owns plugin files, dependency discovery, Oxlint configuration, installation, migration, and rule rollout;
- this skill may consume already-configured lint output as diagnostics;
- this skill owns architecture, behavior, fix choice, accepted findings, and proof;
- anti-slop rules are repository policy when installed, not universal TypeScript or Vue findings.

Limit: the personal anti-slop plugin is intentionally opinionated. Rules such as banning module mocks, runtime `typeof`, `unknown` parameters, or assertions without a safety note can be useful deterministic policy, but this judgment skill does not impose them on repositories that did not choose that policy.

## dmmulroy/kickstart.nix

Source revision: [`a7beb729d3a29237a3a02cb84d53e70fa9ab76a1`](https://github.com/dmmulroy/kickstart.nix/tree/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills).

Review workflow:

- [`code-review/SKILL.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/code-review/SKILL.md)
- [`code-review/agents/openai.yaml`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/code-review/agents/openai.yaml)
- [`.skill-lock.json`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/.skill-lock.json)

The lock attributes `code-review` to [`mattpocock/skills`](https://github.com/mattpocock/skills). Its recorded `skillFolderHash` is a content hash, not a Git commit SHA. The separate standards-versus-spec review is vendored workflow material, not a dmmulroy-authored engineering rule.

Coding standards owned in Kickstart:

- [`coding-standards/SKILL.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/SKILL.md)
- [`comments-and-jsdoc.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/comments-and-jsdoc.md)
- [`configuration-and-resources.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/configuration-and-resources.md)
- [`domain-types-and-state.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/domain-types-and-state.md)
- [`errors.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/errors.md)
- [`imports-exports-and-files.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/imports-exports-and-files.md)
- [`modules-services-and-adapters.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/modules-services-and-adapters.md)
- [`parsing-and-schemas.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/parsing-and-schemas.md)
- [`persistence.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/persistence.md)
- [`sensitive-data-and-observability.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/sensitive-data-and-observability.md)
- [`testing.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/testing.md)
- [`typescript-safety.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/typescript-safety.md)
- [`workflows-transactions-and-idempotency.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/workflows-transactions-and-idempotency.md)

Directly related Effect material was also inspected: [`effect.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect.md), [`effect-alchemy.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-alchemy.md), [`effect-caching.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-caching.md), [`effect-configuration.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-configuration.md), [`effect-http-clients.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-http-clients.md), [`effect-scheduling-and-retry.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-scheduling-and-retry.md), [`effect-schema-and-data.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-schema-and-data.md), [`effect-services.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-services.md), [`effect-streams.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-streams.md), and [`effect-testing.md`](https://github.com/dmmulroy/kickstart.nix/blob/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards/references/effect-testing.md).

Adopted:

- caller-visible contracts before implementation;
- parsing where runtime trust changes;
- ownership by reason to change;
- deep modules and the deletion test;
- explicit async and resource ownership;
- observable-interface tests;
- separate correctness-to-requirement from implementation quality.

Rejected as local or too rigid:

- JSDoc on every export;
- branded IDs by default;
- a custom tagged result for every expected failure;
- a total ban on module mocking;
- end-to-end coverage for every public path;
- property-test analysis for every invariant;
- mandatory safety comments on every assertion;
- fixed adapter counts, service names, Effect Layers, Alchemy patterns, or Effect-specific clients and tests.

Limit: Kickstart contains no Vue-specific skill. Its TypeScript and Effect rules cannot establish Vue behavior.

## getsentry/warden

Source revision: [`543c603782e2b16b0b991838b6e842a36257c9c9`](https://github.com/getsentry/warden/tree/543c603782e2b16b0b991838b6e842a36257c9c9).

Architecture, testing, and prompt workflow:

- [`.agents/skills/architecture-review/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/architecture-review/SKILL.md)
- [`.agents/skills/testing-guidelines/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/testing-guidelines/SKILL.md)
- [`.agents/skills/agent-prompt/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/SKILL.md)
- [`core-principles.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/references/core-principles.md)
- [`agentic-patterns.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/references/agentic-patterns.md)
- [`anti-patterns.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/references/anti-patterns.md)
- [`context-design.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/references/context-design.md)
- [`skill-structure.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/.agents/skills/agent-prompt/references/skill-structure.md)

Review and debugging:

- [`code-review/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/code-review/SKILL.md)
- [`code-review/references/javascript-typescript.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/code-review/references/javascript-typescript.md)
- [`code-review/references/github-workflows.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/code-review/references/github-workflows.md)
- [`security-review/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/security-review/SKILL.md)
- [`security-review/references/javascript-typescript.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/security-review/references/javascript-typescript.md)
- [`security-review/references/github-workflows.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/security-review/references/github-workflows.md)
- [`security-review/references/python.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/builtin-skills/security-review/references/python.md), inspected only because the parent skill links it; no Python rule was adopted.

Agent and skill workflow:

- [`skill-writer/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/SKILL.md)
- [`execution-shapes.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/execution-shapes.md)
- [`authoring-path.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/authoring-path.md)
- [`plan-validate-execute.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/workflow-mechanics/plan-validate-execute.md)
- [`validation-loops.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/workflow-mechanics/validation-loops.md)
- [`parallel-workflows.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/workflow-mechanics/parallel-workflows.md)
- [`iteration-path.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/iteration-path.md)
- [`iteration-evidence.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/iteration-evidence.md)
- [`structure-troubleshooting.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/packages/warden/src/internal-skills/skill-writer/references/structure-troubleshooting.md)
- [`skills/warden/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/skills/warden/SKILL.md)
- [`skills/warden-sweep/SKILL.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/skills/warden-sweep/SKILL.md)
- [`warden-sweep/references/verify-phase.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/skills/warden-sweep/references/verify-phase.md)
- [`warden-sweep/references/patch-prompt.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/skills/warden-sweep/references/patch-prompt.md)
- [`AGENTS.md`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/AGENTS.md)
- [`agents.toml`](https://github.com/getsentry/warden/blob/543c603782e2b16b0b991838b6e842a36257c9c9/agents.toml)

Adopted:

- establish intended behavior before adversarial review;
- trace runtime data, state, errors, and async work across the real path;
- check nullish and falsey values, empty collections, duplicates, stale state, partial failure, concurrency, and cleanup when reachable;
- treat casts, unchecked access, warnings, and patterns as leads rather than findings;
- require source, boundary or missing guard, reachable sink, and concrete impact for security findings;
- separate deterministic diagnostics from judgment;
- use concise routing references and the simplest adequate agent workflow.

Rejected as Warden- or Sentry-specific:

- Warden CLI, sweeps, JSONL manifests, finding IDs, issue and pull-request automation, provider settings, and severity schema;
- fixed file-size, responsibility-count, or import-count thresholds;
- repository-specific pnpm commands and test placement;
- Sentry voice, telemetry, and MCP assumptions;
- React or Next behavior translated directly into Vue rules;
- skipping local tests because a Warden workflow will run them;
- formal holdout corpora and evaluator loops for ordinary application changes.

Limits:

- Warden contains no local Vue skill or Vue registration.
- Its local frontend guidance is React/browser-oriented.
- `code-simplifier` and `react-best-practices` are external registrations in `agents.toml`; their bodies are not part of Warden and were not attributed to it.
- Warden has no standalone debugging skill. Relevant debugging behavior comes from code, security, and architecture review files.

## TypeScript official documentation

Source revision: [`microsoft/TypeScript-Website@c7891e691b4c9319bad04c261127112e49e3ae91`](https://github.com/microsoft/TypeScript-Website/tree/c7891e691b4c9319bad04c261127112e49e3ae91).

Files used:

- [`Basics.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/documentation/copy/en/handbook-v2/Basics.md)
- [`Everyday Types.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/documentation/copy/en/handbook-v2/Everyday%20Types.md)
- [`More on Functions.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/documentation/copy/en/handbook-v2/More%20on%20Functions.md)
- [`Narrowing.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/documentation/copy/en/handbook-v2/Narrowing.md)
- [`Type Compatibility.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/documentation/copy/en/reference/Type%20Compatibility.md)
- [`declaration.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/tsconfig-reference/copy/en/options/declaration.md)
- [`exactOptionalPropertyTypes.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/tsconfig-reference/copy/en/options/exactOptionalPropertyTypes.md)
- [`noUncheckedIndexedAccess.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/tsconfig-reference/copy/en/options/noUncheckedIndexedAccess.md)
- [`useUnknownInCatchVariables.md`](https://github.com/microsoft/TypeScript-Website/blob/c7891e691b4c9319bad04c261127112e49e3ae91/packages/tsconfig-reference/copy/en/options/useUnknownInCatchVariables.md)

Adopted: runtime validation despite static types, narrowing from `unknown`, discriminated unions, optional exhaustiveness, narrow assertions, strict checks as repository policy, and public declaration compatibility.

Limits: TypeScript intentionally permits some unsound behavior. `strict` does not prove runtime safety. Assertions and non-null assertions are supported but unchecked. Official guidance does not ban every `any`, require every return type, or make every declaration change breaking.

## Official Vue sources

Vue documentation revision: [`vuejs/docs@b75d188ab16bf83bd1f364a77dfd2315be8f3fa4`](https://github.com/vuejs/docs/tree/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4).

Files used:

- [`typescript/composition-api.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/typescript/composition-api.md)
- [`reusability/composables.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/reusability/composables.md)
- [`components/props.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/components/props.md)
- [`components/events.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/components/events.md)
- [`essentials/reactivity-fundamentals.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/essentials/reactivity-fundamentals.md)
- [`essentials/computed.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/essentials/computed.md)
- [`essentials/watchers.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/essentials/watchers.md)
- [`essentials/lifecycle.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/essentials/lifecycle.md)
- [`components/async.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/components/async.md)
- [`best-practices/accessibility.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/best-practices/accessibility.md)
- [`scaling-up/ssr.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/scaling-up/ssr.md)
- [`scaling-up/testing.md`](https://github.com/vuejs/docs/blob/b75d188ab16bf83bd1f364a77dfd2315be8f3fa4/src/guide/scaling-up/testing.md)

Router revision: [`vuejs/router@b19cce24aaf561b154b23cd475ca112bd61f2d10`](https://github.com/vuejs/router/tree/b19cce24aaf561b154b23cd475ca112bd61f2d10).

- [`composition-api.md`](https://github.com/vuejs/router/blob/b19cce24aaf561b154b23cd475ca112bd61f2d10/packages/docs/guide/advanced/composition-api.md)
- [`data-fetching.md`](https://github.com/vuejs/router/blob/b19cce24aaf561b154b23cd475ca112bd61f2d10/packages/docs/guide/advanced/data-fetching.md)
- [`navigation-guards.md`](https://github.com/vuejs/router/blob/b19cce24aaf561b154b23cd475ca112bd61f2d10/packages/docs/guide/advanced/navigation-guards.md)

Pinia revision: [`vuejs/pinia@5d6ac5b86491041aa83a663a9a31189c707aff08`](https://github.com/vuejs/pinia/tree/5d6ac5b86491041aa83a663a9a31189c707aff08).

- [`core-concepts/index.md`](https://github.com/vuejs/pinia/blob/5d6ac5b86491041aa83a663a9a31189c707aff08/packages/docs/core-concepts/index.md)
- [`ssr/index.md`](https://github.com/vuejs/pinia/blob/5d6ac5b86491041aa83a663a9a31189c707aff08/packages/docs/ssr/index.md)
- [`cookbook/testing.md`](https://github.com/vuejs/pinia/blob/5d6ac5b86491041aa83a663a9a31189c707aff08/packages/docs/cookbook/testing.md)

Vue Test Utils revision: [`vuejs/test-utils@08184ae4b869038e77c7a4f78461554e3d878d8b`](https://github.com/vuejs/test-utils/tree/08184ae4b869038e77c7a4f78461554e3d878d8b).

- [`a-crash-course.md`](https://github.com/vuejs/test-utils/blob/08184ae4b869038e77c7a4f78461554e3d878d8b/docs/guide/essentials/a-crash-course.md)
- [`event-handling.md`](https://github.com/vuejs/test-utils/blob/08184ae4b869038e77c7a4f78461554e3d878d8b/docs/guide/essentials/event-handling.md)
- [`vue-router.md`](https://github.com/vuejs/test-utils/blob/08184ae4b869038e77c7a4f78461554e3d878d8b/docs/guide/advanced/vue-router.md)

Adopted:

- component, composable, and store ownership by state lifetime and audience;
- readonly props and explicit emitted intent;
- computed values for derivation and watchers for side effects;
- synchronous setup registration and co-located cleanup;
- stale-request invalidation and cancellation;
- specific route-source watching and reused-component behavior;
- semantic HTML, labels, keyboard and focus behavior;
- request-scoped SSR state and deterministic safe hydration;
- tests through rendered output, events, interaction, navigation, store behavior, and cleanup.

Rejected as too rigid or unsupported:

- component or composable extraction by line count;
- composable for every component;
- Pinia for all state;
- one store per file as a correctness rule;
- only `ref` or only `reactive`;
- only `watch` or only `watchEffect`;
- always loading route data before or after navigation;
- async component for every import;
- SSR for every application;
- snapshots, mocks, or shallow mounting banned in all cases.

Limits:

- Vue APIs differ by installed version. Reactive props destructuring, named tuple emits, template-ref inference, watcher cleanup APIs, lazy hydration, and mismatch controls have version constraints.
- Official Vue material does not define a complete production caching, retry, route-loader, SSR deployment, complex-widget accessibility, or hydration-testing architecture.
- Accessibility still requires platform standards and user-focused testing; Vue-specific docs are not complete WCAG coverage.
- The Router data-fetching guide does not provide a complete Composition API production loader contract.

## Rule admission test

Add or strengthen a general rule only when you can name:

1. the reachable failure;
2. the owner that can prevent it;
3. source support;
4. installed-version or repository constraints;
5. valid exceptions;
6. likely false positives;
7. the smallest fix;
8. proof through a stable interface.

Reject generic scores, repeated full-review passes, one finding per lens, rigid layouts, wrapper-everything advice, premature generic abstractions, speculative performance work, automatic tooling installation, and remote or report-file side effects.
