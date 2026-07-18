# Python Tech-Spec Profile

Use this profile when the affected implementation is Python. It is optimized for modern FastAPI and Pydantic code, but local repository conventions and installed versions always win.

## What good looks like

A Python tech spec should feel like Python—not TypeScript transliterated into Python syntax.

- Use complete Python signatures with parameter kinds, return types, and async ownership.
- Use Pydantic models at untrusted or serialized boundaries when the project already uses Pydantic.
- Use dataclasses, ordinary typed classes, enums, or validated value objects for internal concepts according to local precedent.
- Use `Protocol` only for a real external/swappable seam or an interface with multiple implementations; do not create one per class.
- Use typed exception families for expected failures when exceptions are the project's error contract. State where each exception is raised, translated, and allowed to escape.
- Keep FastAPI endpoints thin: parse/inject, authorize, call application behavior, translate the result.
- State transaction, cancellation, blocking-I/O, retry, and idempotency ownership explicitly.

## Evidence behind this profile

These repositories are references, not templates to copy blindly:

1. [FastAPI's official full-stack template](https://github.com/fastapi/full-stack-fastapi-template) is the clearest compact application reference. It separates create/update/public shapes, uses `Annotated[..., Depends(...)]` aliases for request-scoped dependencies, composes routers centrally, and tests behavior through HTTP. Representative source:
   - [`backend/app/models.py`](https://github.com/fastapi/full-stack-fastapi-template/blob/4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8/backend/app/models.py)
   - [`backend/app/api/deps.py`](https://github.com/fastapi/full-stack-fastapi-template/blob/4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8/backend/app/api/deps.py)
   - [`backend/app/api/routes/items.py`](https://github.com/fastapi/full-stack-fastapi-template/blob/4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8/backend/app/api/routes/items.py)
   - [`backend/tests/api/routes/test_items.py`](https://github.com/fastapi/full-stack-fastapi-template/blob/4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8/backend/tests/api/routes/test_items.py)
2. [Prefect](https://github.com/PrefectHQ/prefect) is the strongest production async reference. It separates action schemas, outward schemas, HTTP routes, persistence operations, transaction scopes, and lifecycle events; its API tests cover validation, conflict, and not-found behavior. Representative source:
   - [`src/prefect/server/schemas/actions.py`](https://github.com/PrefectHQ/prefect/blob/60025750fb7ea1d69fef8a1c8b1e013cdc8149ae/src/prefect/server/schemas/actions.py)
   - [`src/prefect/server/api/variables.py`](https://github.com/PrefectHQ/prefect/blob/60025750fb7ea1d69fef8a1c8b1e013cdc8149ae/src/prefect/server/api/variables.py)
   - [`src/prefect/server/models/variables.py`](https://github.com/PrefectHQ/prefect/blob/60025750fb7ea1d69fef8a1c8b1e013cdc8149ae/src/prefect/server/models/variables.py)
   - [`tests/server/orchestration/api/test_variables.py`](https://github.com/PrefectHQ/prefect/blob/60025750fb7ea1d69fef8a1c8b1e013cdc8149ae/tests/server/orchestration/api/test_variables.py)
3. [FastAPI Users](https://github.com/fastapi-users/fastapi-users) is the strongest focused reference for dependency seams, Pydantic v2 safe create/update shapes, domain-exception-to-HTTP mapping, stable error codes, and security-negative HTTP tests. Representative source:
   - [`fastapi_users/schemas.py`](https://github.com/fastapi-users/fastapi-users/blob/d02c73b69582c0e69210a6d7d527b4eb4ebe1bb6/fastapi_users/schemas.py)
   - [`fastapi_users/router/register.py`](https://github.com/fastapi-users/fastapi-users/blob/d02c73b69582c0e69210a6d7d527b4eb4ebe1bb6/fastapi_users/router/register.py)
   - [`fastapi_users/router/common.py`](https://github.com/fastapi-users/fastapi-users/blob/d02c73b69582c0e69210a6d7d527b4eb4ebe1bb6/fastapi_users/router/common.py)
   - [`tests/test_router_register.py`](https://github.com/fastapi-users/fastapi-users/blob/d02c73b69582c0e69210a6d7d527b4eb4ebe1bb6/tests/test_router_register.py)
4. [Polar](https://github.com/polarsource/polar) is an additional production-scale reference for domain-oriented packages containing `endpoints.py`, `schemas.py`, `service.py`, and `repository.py`, plus async services and application-specific error families.
5. [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices) is a useful conventions reference for feature-oriented packages, deliberate sync/async choices, Pydantic v2 boundary validation, async HTTP tests, and `dependency_overrides`. Strengthen examples that use `dict[str, Any]` into real domain/boundary types.

Caveats:

- The official template is intentionally small and mostly synchronous. Do not copy its global `models.py`, `crud.py`, or session style into a large domain-rich async system without evidence.
- Prefect, Polar, and FastAPI Users contain infrastructure and abstractions justified by their scale or library role. Copy separation and contracts, not their vocabulary or layer count wholesale.
- Popular “clean architecture” templates often add repositories, use-case classes, and interfaces before a second implementation exists. Prefer the shallowest design that still owns invariants and real boundaries.

## Select the contract form

| Responsibility | Default Python representation |
|---|---|
| HTTP body/query/response | Pydantic `BaseModel`/project schema base with field constraints |
| Environment/config boundary | `pydantic-settings` model when already used; parse once at startup |
| Internal immutable value | frozen dataclass, enum, validated value object, or local established type |
| Database row/model | ORM model kept behind persistence ownership; do not treat loaded data as an API model by accident |
| Service operation | typed function or cohesive class method with keyword-only request object when inputs grow |
| External dependency seam | narrow `Protocol` or existing concrete adapter, only when substitution/boundary evidence exists |
| Expected failure | project exception family with stable attributes, or the project's existing result type |
| Request-scoped dependency | `Annotated[T, Depends(provider)]` alias or local equivalent |
| Background/durable work | explicit queue/workflow contract; not FastAPI `BackgroundTasks` for work requiring durability |

Pydantic is a boundary tool, not a reason to make every internal value inherit `BaseModel`. Conversely, do not pass raw dictionaries inward when a validated domain/application shape exists.

## Required Python design details

For FastAPI/Pydantic work, cover the responsibilities below only when they are affected or reachable. Omit absent concerns instead of inventing dependencies, tenancy, transactions, or framework structure:

1. **Framework boundary**
   - router prefix/tags and request/response models;
   - dependency aliases for auth, tenant, session, and external clients;
   - where `HTTPException` or framework responses are created;
   - how application errors become status codes and safe response bodies.
2. **Validation ownership**
   - structural/field validation owned by Pydantic;
   - database, authorization, uniqueness, and external-service checks owned by dependencies or application services;
   - ORM/persistence data translated before crossing into API/domain contracts when representations differ.
3. **Async ownership**
   - whether each entrypoint and dependency is sync or async;
   - which calls perform I/O;
   - how blocking SDKs leave the event loop;
   - cancellation, timeout, retry, and transaction behavior;
   - whether slow external awaits happen outside database transaction/session lifetimes when consistency allows.
4. **Application ownership**
   - where invariants and effect ordering live;
   - which repository/adapter owns SQL or vendor translation;
   - whether a proposed `Protocol` has real leverage rather than merely mirroring one implementation.
5. **Test seam**
   - HTTP behavior through the ASGI app for route contracts;
   - application/service behavior through its public operation;
   - real database tests when SQL, constraints, locking, or transactions matter;
   - dependency overrides or recording fakes only at external boundaries;
   - negative cases for validation (`422`), not found (`404`), conflict (`409` or local equivalent), authorization, privilege escalation, tenant isolation, and secret-field non-disclosure when reachable.

## Contract example

Use names from the real domain; this example shows the level of precision, not a required architecture.

```python
from dataclasses import dataclass
from typing import Annotated, Protocol
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field


class CreateReportRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ReportResponse(BaseModel):
    id: UUID
    title: str


@dataclass(frozen=True, slots=True)
class CreateReport:
    organization_id: UUID
    title: str


class ReportStore(Protocol):
    async def create(self, command: CreateReport) -> "Report": ...


class DuplicateReportTitle(Exception):
    def __init__(self, *, organization_id: UUID, title: str) -> None:
        self.organization_id = organization_id
        self.title = title
        super().__init__(f"Report title already exists: {title}")


async def create_report(
    command: CreateReport,
    *,
    store: ReportStore,
) -> "Report": ...


ReportStoreDep = Annotated[ReportStore, Depends(get_report_store)]
OrganizationDep = Annotated["Organization", Depends(require_organization)]

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report_endpoint(
    request: CreateReportRequest,
    organization: OrganizationDep,
    store: ReportStoreDep,
) -> ReportResponse:
    report = await create_report(
        CreateReport(organization_id=organization.id, title=request.title),
        store=store,
    )
    return ReportResponse.model_validate(report)
```

A real spec must also show the error projection—for example, where `DuplicateReportTitle` becomes a stable `409` response—and transaction ownership. Do not hide those decisions behind `...` in the final artifact.

## Python call-stack shape

```text
HTTP request
  -> FastAPI router
  -> Pydantic request model
  -> auth / tenant / session dependencies
  -> application command or service operation
  -> repository / external adapter
  -> ORM or vendor boundary
  -> typed value or expected exception
  -> endpoint error/response projection
  -> Pydantic response model
  -> HTTP response
```

For mixed Python/TypeScript systems, add the serialization path:

```text
Python Pydantic owner
  -> OpenAPI / JSON Schema artifact
  -> generated or validated TypeScript contract
  -> frontend caller
```

If TypeScript owns the contract instead, reverse the ownership arrow and name the generator/parser. Never describe two handwritten shapes as independent sources of truth.

## Python test-plan shape

Prefer vertical behavior slices:

```text
RED: HTTP request rejects an invalid boundary shape
GREEN: add the Pydantic constraint and stable response contract

RED: authorized request produces the domain-visible result
GREEN: implement the application operation and persistence effect

RED: duplicate request returns the agreed expected failure
GREEN: add invariant ownership, error translation, and transaction behavior
```

For an async FastAPI app, specify an HTTP seam like:

```python
from httpx import ASGITransport, AsyncClient

async with AsyncClient(
    transport=ASGITransport(app=app),
    base_url="http://test",
) as client:
    response = await client.post("/reports/", json={"title": "Weekly"})
```

Use the project's existing fixture and transaction strategy. Do not introduce an async test client into an intentionally synchronous app solely to follow this profile.
