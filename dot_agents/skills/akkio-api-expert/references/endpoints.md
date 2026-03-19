# Akkio Endpoints

Use this file to map endpoints to their OpenAPI request and response schemas.

## v2 Endpoint Map

| Endpoint | Success | Request schema | Success schema | Notes |
|---|---|---|---|---|
| `POST /api/v1/chat-explore/new` | `201` | `ChatExploreRequestPayload` | `APITaskStartedResponse` | Async submit |
| `GET /api/v1/chat-explore/status/{task_id}` | `200` | path `task_id` | `APIStatusResponse` | Async status |
| `GET /api/v1/chat-explore/chats/{id}` | `200` | path `id`, optional query `image_format` | `_ApiBaseChatRecord` | Final chat result |
| `POST /api/v1/projects` | `200` | `CreateProjectPayload` | `GetProjectResponse` | Synchronous |
| `GET /api/v1/projects/{project_id}` | `200` | path `project_id` | `GetProjectResponse` | Synchronous |
| `PUT /api/v1/projects/{project_id}` | `200` | `UpdateProjectPayload` | `GetProjectResponse` | Synchronous |
| `DELETE /api/v1/projects/{project_id}` | `200` | path `project_id` | generic object | No typed response body |
| `POST /api/v1/models/train/new` | `201` | `TrainRequestPayload` | `APITaskStartedResponse` | Async submit |
| `GET /api/v1/models/train/{task_id}/status` | `200` | path `task_id` | `APIStatusResponse` | Async status |
| `GET /api/v1/models/train/{task_id}/result` | `200` | path `task_id` | generic object | Spec does not type the body |

All listed v2 endpoints can also return `422` with `HTTPValidationError`.

## Practical Rules From The YAML

- `POST .../new` returns only `task_id`, not the final result.
- Status endpoints return `APIStatusResponse`, where `metadata` changes shape by `metadata.type`.
- Chat result payloads are typed as `_ApiBaseChatRecord`, not a custom one-off response schema.
- Training result is intentionally loose in the spec: `type: object`. Inspect runtime JSON before freezing client models.
- Project create, get, and update all use `GetProjectResponse` as the success schema.
- Project delete returns an untyped object, so do not assume a specific success payload.

## Legacy Coverage

Use `references/legacy.md` for `/v1/datasets`, `/v1/models`, and custom client patterns.
