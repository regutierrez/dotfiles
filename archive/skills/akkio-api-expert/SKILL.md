---
name: akkio-api-expert
description: Build and debug integrations against the Akkio public API, including v2 Chat Explore, Projects, Training, and legacy dataset/model endpoints. Use when implementing Akkio clients, polling async jobs, reconciling doc mismatches, or reasoning about Akkio datasets, projects, training, and deployment behavior.
disable-model-invocation: true
references:
  - references/overview.md
  - references/endpoints.md
  - references/schemas.md
  - references/legacy.md
  - references/workflows.md
  - references/gotchas.md
  - references/examples.md
---

# Akkio API Expert

This skill helps implement against Akkio's split API surface without mixing v2 and legacy conventions.

## Core Rules

- Decide the surface first: v2 is `https://api.akkio.com/api/v1/...`; legacy is `https://api.akkio.com/v1/...`.
- For v2, use `X-API-Key`. For legacy, use `api_key`. Never mix them.
- Check request and response shapes in the OpenAPI YAML before coding. Prefer schema names and enums over prose.
- Treat only `SUCCEEDED` as async success. Poll on `PENDING` and `IN_PROGRESS`; fail on `FAILED` and `UNKNOWN_TIMEOUT`.
- Parse `metadata.location` literally.
- Re-send full Chat Explore message history every turn.
- Use `project_id` when project chat instructions matter.
- Be tolerant of extra fields because many v2 schemas set `additionalProperties: true`.

## Reading Order

| Task | Files |
|------|-------|
| Get oriented quickly | `references/overview.md` |
| Build v2 clients | `references/endpoints.md`, `references/schemas.md`, and `references/examples.md` |
| Use legacy dataset/model APIs | `references/legacy.md` and `references/examples.md` |
| Debug errors or doc mismatches | `references/gotchas.md` |
| Understand platform behavior and limits | `references/workflows.md` |

## Decision Tree

What are you building?

```text
Chat about data
|- Need project instructions -> v2 Chat Explore with project_id
`- Need direct dataset access -> v2 Chat Explore with dataset_id

Manage project metadata or chat instructions
`- v2 Projects

Train a tabular model
`- v2 Training

List/create/update/delete datasets or add rows
`- legacy Datasets endpoints with a thin custom client

Predict with an existing model, list models, or delete models
`- legacy Models endpoints with a thin custom client

Unsure which docs apply
`- Start with overview.md, then gotchas.md
```

## Recommended Workflow

1. Confirm the API surface before writing code.
2. Check the endpoint's request and success/error schemas before writing models or helpers.
3. Get auth working with one small request before building abstractions.
4. For async endpoints, implement submit -> poll -> fetch-result as a reusable pattern.
5. Log endpoint path, non-2xx body, `task_id`, final task status, and `location` while debugging.
6. Keep v2 and legacy helpers separate so auth and URL handling do not leak across surfaces.
7. If `_org` or `_owner` are required and unavailable, say so clearly because the docs do not explain how to discover them.

## In This Reference

| File | Purpose |
|------|---------|
| [overview.md](./references/overview.md) | Mental model, surface split, auth, URLs, and first-step guidance |
| [endpoints.md](./references/endpoints.md) | Endpoint-to-schema map for v2 and legacy coverage |
| [schemas.md](./references/schemas.md) | YAML-verified request and response component shapes |
| [legacy.md](./references/legacy.md) | Legacy datasets/models coverage and custom client patterns |
| [workflows.md](./references/workflows.md) | Product workflows, forecasting/deployment behavior, PostgreSQL notes, and limits |
| [gotchas.md](./references/gotchas.md) | Inconsistencies, debugging checklist, and safe defaults |
| [examples.md](./references/examples.md) | Working Python patterns for v2 and legacy integration code |

## Delivery Expectations

When using this skill:

- State which API surface is in play before proposing code.
- Name the exact request and response schemas for the endpoint before assuming payload shapes.
- Distinguish YAML-backed v2 claims from legacy `/v1/...` guidance that comes from product docs.
- Call out known doc mismatches explicitly instead of silently guessing.
- Prefer resilient polling and error handling over optimistic one-shot code.
- Keep legacy and v2 examples separate and Python-only.
- Preserve the distinction between Akkio chat features and trained tabular models.
