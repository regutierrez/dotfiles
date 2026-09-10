# Python Contracts and Runtime

Check the project's Python version, package manager, framework, configured type checker, and established sync/async conventions. Use Python-native forms only where they clarify a real contract.

## Types and boundaries

- Prefer ordinary typed functions and values; use dataclasses, boundary models, protocols, overloads, and exception families for actual data or call contracts.
- Investigate `Any`, casts, reflection, and ignores that spread unknown facts into internal code. Needed dynamic behavior can remain at an external boundary.
- Preserve known narrow types rather than widening and recovering them later.
- Make valid construction states explicit instead of repairing invalid combinations after construction.
- Match declared response, event, and persisted shapes at runtime. Check the installed validation library's coercion and serialization behavior rather than assuming annotations validate data.

Protocols and advanced typing earn their place by describing supported callers or real variation. Branded IDs and result values for every failure are not Python defaults imposed by this skill.

## Exceptions and ownership

Use the established exception contract and preserve causes when translating dependency failures. Check what happens to cancellation and cleanup when catching exceptions, especially at framework request or job boundaries. Treat ordinary absence separately from malformed data or failed work.

Prefer context managers for scoped clients, sessions, files, streams, cursors, and similar resources. Prefer task groups for related concurrent work when supported by the installed runtime and framework. Trace who observes background task failures and owns shutdown.

Check executor ownership, resource reuse, partial startup, ownership transfer, double-close, and use-after-close where the path permits them. A factory returning a live resource needs a cleanup contract callers can honor.

## Sync and async execution

Trace actual database, HTTP, filesystem, subprocess, and CPU work beneath `async` functions. Follow awaits to a real suspension point, asynchronous operation, or executor/process boundary. Check whether the framework runs sync handlers or dependencies in a worker, and whether a direct internal call bypasses that dispatch.

Preserve sync/async calling conventions, cancellation behavior, and thread/process assumptions when changing a public function. Use the responsiveness proof in [behavior.md](behavior.md) when blocking work could stop unrelated requests.

## Python proof and tooling

Use configured tests through public functions, HTTP/request interfaces, outputs, errors, resource cleanup, and framework-supported dependency overrides. Narrow patching is valid at unavoidable process/global boundaries; prefer faithful external implementations when practical.

Run the repository's configured Ruff, type-checker, test, and relevant CI-equivalent commands. When checker configuration or rollout details need inspection, locate `installing-anti-slop-py` through the harness's skill discovery and load its read-only audit only when explicitly requested. Skills may be cached separately; use the discovered location rather than assuming sibling directories. If it is unavailable, use the configured commands and state the missing guidance. This does not authorize installation or migration.

Keep compiler/linter diagnostics separate from behavioral findings. Tooling policy comes from this repository, not from whether it is a work or personal project.
