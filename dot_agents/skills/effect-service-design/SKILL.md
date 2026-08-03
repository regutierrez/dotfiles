---
name: effect-service-design
description: Design Effect services. Use when designing a new Effect service module or auditing an existing codebase for service, Layer, and composition improvements.
---

# Effect Service Design

Effect service rules live under the `coding-standards` skill. Load that skill and read the matching references before you design or audit.

## Always load

1. `coding-standards/references/effect.md` — Effect branch chooser
2. `coding-standards/references/effect-services.md` — services, Layers, composition, test services
3. `coding-standards/references/modules-services-and-adapters.md` — module ownership and adapters

Also load any other `coding-standards` Effect branch that matches the change (schema, config, retry, caching, streams, HTTP, testing).

## Select the branch

- **Design branch:** for a new service or a focused redesign, bound the capability, trace one caller-visible operation through every effect, then apply the Effect service rules above.
- **Audit branch:** for a codebase, package, feature slice, or diff, read and follow [`references/AUDIT.md`](references/AUDIT.md). Apply the Effect service rules above to every candidate it finds.

## Finish

- **Design branch:** record the service-or-value decision and its evidence. When implementation is requested, create or refactor the module, update composition roots and tests, and run the repository's required checks.
- **Audit branch:** produce prioritized findings with file/line or symbol evidence, target module shapes, composition and test impact, and explicit “keep” decisions.

**Complete when:** the designed capability has an explicit disposition and validated implementation when requested, or every audit inventory row has a disposition; validation passes or every failure is reported.
