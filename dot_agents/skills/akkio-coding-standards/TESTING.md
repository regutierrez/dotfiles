# Which tests to write

What to test for a given change. The table lists the cases that earn tests; changes outside it default to no new tests. How to write them lives in [PYTHON.md](PYTHON.md) / [TYPESCRIPT.md](TYPESCRIPT.md); per-dependency strategy in [SEAMS.md](SEAMS.md).

**Test through the front door.** Tests call the module the same way real callers do and check results a caller could see. If you feel the urge to reach inside — poking private state, spying on methods — the module is shaped wrong: pull the plain logic out into its own function instead of writing the invasive test. Exception: Python private methods that actually hold the logic are fair game.

## Decision table

| Change | Test to write |
|---|---|
| New plain logic (builders, data cleanup, SQL building) | Unit tests next to the code, through its public functions, no fakes — enough to cover the real rules, not exhaustive for its own sake |
| Bug fix | A regression test in the same commit, named after the reason for the fix |
| A schema or `as const` field list that drives runtime behavior | A guard test pinning `Object.keys(Schema.shape).sort()` (or the field list) to a literal, so any change forces someone to look |
| Checking input at an edge (escaping, null bytes, size limits) | Tests with hostile inputs, at the edge that owns the check |
| Repo/DB layer in the Python backend | testcontainers integration test — don't fake the repo layer |
| Code that calls an external service (warehouse, LLM) | Test your side thoroughly (the payload/SQL/prompt you build); fake only the part that sends it, with a small hand-written fake |
| Merging or strengthening thin modules | New tests at the new public functions; **delete** the old thin-module tests (see [SEAMS.md](SEAMS.md)) |

## Don't write tests for

- Pass-along code (handlers that parse, call, and return; component glue) — the plain logic they call is where the tests go.
- Things the framework or code generator already guarantees (Zod parses what it parses, generated clients, vue-query caching).
- Fake copies of an external service's behavior — asserting against your own fake proves nothing. Test the request you build, not the response you invented.

## Already set up (don't re-declare)

- vitest workspace defaults: `mockReset: true`, `unstubGlobals: true`; some workspaces add global setup.
- Python backend pytest: asyncio `auto` mode (no `@pytest.mark.asyncio` needed), xdist, testcontainers, pytest-env/dotenv.
- Where tests live: next to the code — `foo.test.ts` (TS) and `*_test.py` (newer Python); older packages still use `tests/` folders — follow whatever the package you're in does.
