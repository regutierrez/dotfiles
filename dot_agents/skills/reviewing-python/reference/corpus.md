# Sources and Limits

Use these sources to test a rule, not copy a project's local style. A general rule needs a language-level reason or support from several independent codebases. It also needs practical exceptions.

## HTTPX

Sources at [`b5addb6`](https://github.com/encode/httpx/tree/b5addb64f0161ff6bfe94c124ef76f6a1fba5254):

- [client lifetime](https://github.com/encode/httpx/blob/b5addb64f0161ff6bfe94c124ef76f6a1fba5254/httpx/_client.py)
- [transport interface](https://github.com/encode/httpx/blob/b5addb64f0161ff6bfe94c124ef76f6a1fba5254/httpx/_transports/base.py)
- [public errors](https://github.com/encode/httpx/blob/b5addb64f0161ff6bfe94c124ef76f6a1fba5254/httpx/_exceptions.py)
- [configuration rules](https://github.com/encode/httpx/blob/b5addb64f0161ff6bfe94c124ef76f6a1fba5254/httpx/_config.py)

Use: small transport boundaries, clear client ownership, useful public errors, rejected invalid states, and stable APIs.

Limit: do not copy its layers or error tree into a simpler system.

## FastAPI

Sources at [`c3f316b`](https://github.com/fastapi/fastapi/tree/c3f316b7e814667e8ee81e03a7330d00ee61e45c):

- [dependency lifetime](https://github.com/fastapi/fastapi/blob/c3f316b7e814667e8ee81e03a7330d00ee61e45c/fastapi/dependencies/utils.py)
- [routing and response validation](https://github.com/fastapi/fastapi/blob/c3f316b7e814667e8ee81e03a7330d00ee61e45c/fastapi/routing.py)
- [test overrides](https://github.com/fastapi/fastapi/blob/c3f316b7e814667e8ee81e03a7330d00ee61e45c/fastapi/applications.py)

Use: validate input and output, tie cleanup to request lifetime, provide supported test hooks, and make sync or async execution clear.

Limit: framework dependency injection is not a general application architecture.

## Flask

Sources at [`d318b68`](https://github.com/pallets/flask/tree/d318b683471101618febed18996405ad26462110):

- [request and error flow](https://github.com/pallets/flask/blob/d318b683471101618febed18996405ad26462110/src/flask/app.py)
- [context lifetime](https://github.com/pallets/flask/blob/d318b683471101618febed18996405ad26462110/src/flask/ctx.py)
- [request limits](https://github.com/pallets/flask/blob/d318b683471101618febed18996405ad26462110/src/flask/wrappers.py)

Use: cleanup on success and failure, top-level error handling, input limits, and stable extension points.

Limit: do not spread Flask's context-local or extension design into normal modules.

## Jinja

Sources at [`5ef7011`](https://github.com/pallets/jinja/tree/5ef70112a1ff19c05324ff889dd30405b1002044):

- [sandbox boundary](https://github.com/pallets/jinja/blob/5ef70112a1ff19c05324ff889dd30405b1002044/src/jinja2/sandbox.py)
- [environment contract](https://github.com/pallets/jinja/blob/5ef70112a1ff19c05324ff889dd30405b1002044/src/jinja2/environment.py)
- [security tests](https://github.com/pallets/jinja/blob/5ef70112a1ff19c05324ff889dd30405b1002044/tests/test_security.py)

Use: contain needed dynamic behavior, test bypass paths, separate trusted and sandboxed execution, and bound less-trusted work.

Limit: reflection and dynamic calls are not always wrong.

## dmmulroy/kickstart.nix

Sources at [`a7beb72`](https://github.com/dmmulroy/kickstart.nix/tree/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills):

- [coding standards](https://github.com/dmmulroy/kickstart.nix/tree/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/coding-standards)
- [code review](https://github.com/dmmulroy/kickstart.nix/tree/a7beb729d3a29237a3a02cb84d53e70fa9ab76a1/home/.agents/skills/code-review)

Use: contracts that prevent invalid states, deep modules, the deletion test, ownership by reason to change, boundary parsing, resource ownership, and real-interface tests.

Limit: adapt TypeScript rules to Python. Do not require branded IDs, export docs, a fixed adapter count, or result values for every error.

The coding standards are Mulroy's. Several other skills are vendored from [`mattpocock/skills`](https://github.com/mattpocock/skills/tree/5b15a47f2d7150f545fbcacbfe381787fc0230dc). Keep that attribution clear.

## ThePrimeagen/skills

Sources at [`fa570dd`](https://github.com/ThePrimeagen/skills/tree/fa570dd76421dc9b608e2a8134d4457206f3f953/skills):

- [test-first planning](https://github.com/ThePrimeagen/skills/blob/fa570dd76421dc9b608e2a8134d4457206f3f953/skills/prime-planning/SKILL.md)
- [diff-focused review](https://github.com/ThePrimeagen/skills/blob/fa570dd76421dc9b608e2a8134d4457206f3f953/skills/prime-review/SKILL.md)
- [observe before changing](https://github.com/ThePrimeagen/skills/blob/fa570dd76421dc9b608e2a8134d4457206f3f953/skills/printf_debug/debug.md)

Use: prove a failure first, observe before diagnosing, keep findings tied to the diff, test the real boundary, and preserve local mechanisms.

Limit: do not require every test to be end-to-end, expose unredacted debug state, or copy frontend, Cloudflare, Drizzle, Bun, or tmux rules.

## Companion skill

Use the read-only inspection and configured checks from `preventing-py-slop`. It owns Ruff, type-checker, CI, installation, migration, and checker rollout details. This skill owns architecture, fix choice, behavior, and the verdict.

## Add a general rule only when

You can name the failure, source examples, existing tool coverage, valid exceptions, likely false positives, simpler alternative, and proof.

Reject generic scores, repeated full-review passes, every-branch test rules, guessed caching, automatic remote changes, report-file side effects, and conflicting severity systems.
