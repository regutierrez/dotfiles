# YAML-Verified Schema Shapes

Use these shapes when writing Python models, validators, or response parsers.

## General Rules

- Many v2 schemas set `additionalProperties: true`, so allow extra keys.
- Prefer enums and required fields from the YAML over prose examples.
- `422` responses use `HTTPValidationError`, not `APIStatusResponse`.

## `APIChatMessage`

Required:

- `role`: `user | assistant`
- `content`: `string`

Optional:

- `images`: defaults to `[]`; array items are `string | object`
- `table`: `array<object> | null`

Notes:

- image entries can be raw strings or structured objects
- table rows are generic objects keyed by column name

## `ChatExploreRequestPayload`

Required:

- `messages`: `APIChatMessage[]`

Optional and nullable:

- `project_id`: `string | null`
- `dataset_id`: `string | null`

Optional strings with default `""`:

- `chatContext`
- `chatInstructions`

Important rule from the description:

- either `project_id` or `dataset_id` must be provided, even though the YAML does not encode that constraint via `required`

## `_ApiBaseChatRecord`

Required:

- `_owner`: `string`
- `_org`: `string`
- `messages`: `APIChatMessage[]`

Use this for `GET /api/v1/chat-explore/chats/{id}`.

## `APITaskStartedResponse`

Required:

- `task_id`: `string`

Use this for the initial `POST /new` responses.

## `APIStatusResponse`

Required:

- `status`: `TaskStatusEnum`
- `metadata`: one of the status metadata objects below

`TaskStatusEnum` values:

- `PENDING`
- `IN_PROGRESS`
- `SUCCEEDED`
- `FAILED`
- `UNKNOWN_TIMEOUT`

### `APIStatusMetadataPending`

- `type`: always `PENDING`

### `APIStatusMetadataInProgress`

- `type`: always `IN_PROGRESS`
- `estimate_seconds`: `number | null`

### `APIStatusMetadataSucceeded`

- `type`: always `SUCCEEDED`
- `location`: `string` and required

### `APIStatusMetadataFailed`

- `type`: always `FAILED`
- `error`: `string`, defaulting to a generic support message

Important note:

- `metadata` uses a discriminator on `type`, so parse `metadata.type` together with top-level `status`
- the YAML requires both `status` and `metadata`
- `TaskStatusEnum` includes `UNKNOWN_TIMEOUT`, but the metadata discriminator only defines `PENDING`, `IN_PROGRESS`, `SUCCEEDED`, and `FAILED`; treat `UNKNOWN_TIMEOUT` as a terminal error and inspect the raw payload instead of assuming a typed metadata shape

## `CreateProjectPayload`

Required:

- `_owner`: `string`
- `_org`: `string`
- `name`: `string`

Optional strings with default `""`:

- `chatContext`
- `chatInstructions`
- `chatSuggestions`

## `UpdateProjectPayload`

All fields are optional and nullable strings:

- `name`
- `chatContext`
- `chatInstructions`
- `chatSuggestions`

## `GetProjectResponse`

Required:

- `id`: `string`

Other fields:

- `name`: `string`, default `""`
- `chatContext`: `string`, default `""`
- `chatInstructions`: `string`, default `""`
- `chatSuggestions`: `string`, default `""`

## `ChatExploreImageFormat`

Enum values:

- `base64_png`
- `plotly_json`

## `TrainRequestPayload`

Required:

- `dataset_id`: `string`
- `predict_fields`: `string[]`
- `duration`: `integer`

Optional:

- `ignore_fields`: `string[]`, default `[]`
- `extra_attention`: `boolean`, default `false`
- `force`: `boolean`, default `false`

Allowed `duration` values from the description:

- `10`
- `60`
- `300`
- `1800`

## `HTTPValidationError`

Response shape:

- `detail`: `ValidationError[]`

`ValidationError` requires:

- `loc`: `(string | integer)[]`
- `msg`: `string`
- `type`: `string`
