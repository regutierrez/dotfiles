# Python standards (ml/, shared packages)

## Package layout

Start with a single file (a module); grow it into a package when size demands it. When a feature does become a package:

- a models module — Pydantic models built on the repo's shared base model
- an interface (abstract base class) module only once a second implementation exists — for example a zoo of providers. One implementation needs no interface.
- one focused helper per module; one module per backend integration
- `__init__.py` — re-export the public parts; group `__all__` with comment sections

Users of the package import from the package root, not from inner files. Files starting with `_` are internal. Move code up a level only when a second user appears.

## Typing

- TypeVars with bounds, named `TypeX`: `TypeResult = TypeVar("TypeResult", bound=BaseResult)`; interfaces are `Generic[TypeQuery, TypeResult]`.
- `@overload` when it makes a function nicer to call with either a string or a model.
- `Protocol` (+ `@runtime_checkable`) for config contracts; `ClassVar` for class-level registries and metadata.
- Every data shape is a Pydantic model. A schema sent to an LLM is part of the prompt: write `Field(description=...)` as prompt text, and hide internal plumbing fields from the JSON schema.
- If you touch a `def __init__(self, *args, **kwargs)`, replace it with explicit typed parameters.

## Errors

- Build exception class families where each type can answer `user_message()` (what to show the user) and `should_retry()` (whether trying again makes sense).
- Fail as early as possible: `__init_subclass__` can raise `TypeError` the moment a subclass is declared wrongly; `assert` required settings in `__init__`.
- Check incoming data only at real edges (escaping, null bytes, size limits); raise `ValueError` there, and test the hostile inputs.
- Retries go through tenacity decorators, not hand-written retry loops.

## API design

- Keyword-only arguments wherever mixing them up would hurt: `def run(*, agent, message, ctx, log_prefix)`.
- Small Pydantic request/response objects as the call contract.
- Only pass in ("inject") truly external things that a test swaps for a fake. No do-nothing default objects — when effects silently disappear because wiring was forgotten, bugs hide. If a dependency is optional, make that visible where the code is called.
- Write async code first; add a sync version only when a real caller needs one. Don't maintain two copies of an API by default.
- Prompt templates are `_UPPER_SNAKE` triple-quoted constants at the top of the file, filled in with `.format()`.
- Loguru with the component name up front: `logger.info(f"CompositeSearch: reranking {n} candidates")`.

## Async

- `asyncio.gather` to run several calls at once.
- Use the repo's context-preserving thread-pool executor for sync wrappers; plain `ThreadPoolExecutor` is blocked by lint.
- `ContextVar` only for background request information (who's calling, request IDs) — never to pass in behavior. Always set and reset it with a token in `try/finally`.

## Test style

- A docstring at the top of the test file says what's covered ("Unit tests for X SQL construction. No warehouse calls.").
- One test class per unit; method names describe the behavior being checked.
- Testing private methods is fine when that's where the logic actually lives.
- Prefer small hand-written fake classes that implement every abstract method over autospec magic; tiny `_fake_*() -> MagicMock` helpers for external things.
- Check structure, not just values: `assert sql.index("NOT IN") < sql.index("top_k =>")` proves the parts come out in the right order.
