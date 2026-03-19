# Akkio API Overview

Use this file first to orient yourself before writing code.

## Mental Model

- Akkio has two public API surfaces:
  - `v2 API`: `https://api.akkio.com/api/v1/...`
  - `legacy API`: `https://api.akkio.com/v1/...`
- `model` usually means a trained tabular ML predictor, not the chat LLM.
- Main nouns:
  - `Dataset`: tabular data
  - `Project`: wrapper around a dataset for transforms, Chat Explore, training, and deployment
  - `Chat Explore`: LLM-like experience over data
  - `Training` / `Predict` / `Forecasting`: tabular ML workflows

Typical use cases:

- classification: churn, fraud, lead scoring
- regression: revenue, price
- forecasting: future sales, demand

## Documentation Split

This is the biggest debugging risk.

| Surface | Base path | Auth | Covers |
|---|---|---|---|
| v2 | `https://api.akkio.com/api/v1/...` | `X-API-Key` header | Chat Explore, Projects, Training |
| legacy | `https://api.akkio.com/v1/...` | `api_key` query/body param | Datasets CRUD, model listing, model prediction, model deletion |

The v2 spec does not currently document dataset CRUD or prediction/inference. For those workflows, use the legacy docs and build a thin custom client against `/v1/...`.

## Must-Know URLs

- Docs: `https://api-docs.akkio.com/`
- OpenAPI UI: `https://api.akkio.com/api/v1/docs`
- OpenAPI YAML: `https://api.akkio.com/api/v1/api.yaml`
- Product docs: `https://docs.akkio.com/akkio-docs/`

## Auth

### v2

```http
X-API-Key: <your_api_key>
```

Store the key in an environment variable:

```bash
export AKKIO_API_KEY="your_real_api_key_here"
```

Status meanings:

- `401`: missing or invalid key, sometimes caused by whitespace or wrong header name
- `403`: key is valid, but the org does not have access to the resource
- `422`: request payload failed schema validation

Do not use `api_key` query params for v2.

### legacy

Older docs and legacy examples use `api_key` in query params or the request body. Do not mix this auth style with v2 endpoints.

## Trust Rules

- Trust the OpenAPI schema over prose examples for machine-facing behavior.
- Akkio's v2 API is beta. Docs say changes should remain backward-compatible, with breaking changes announced in a changelog.
- When docs disagree, prefer exact field names and enums from the schema.

## First-Step Workflow

1. Decide whether the task needs v2 or legacy.
2. Verify a real API key with a single small request.
3. For async v2 endpoints, confirm you can poll to `SUCCEEDED` and then fetch the final result.
4. Print and inspect the full JSON response before wrapping it in abstractions.

## High-Value Defaults

- If custom chat instructions matter, use `project_id`, not `dataset_id`.
- Treat only `SUCCEEDED` as success for async jobs.
- Keep v2 helpers and legacy helpers separate.
- Check the literal `location` string before concatenating URLs.

## Source Index

v2 API docs:

- `https://api-docs.akkio.com/`
- `https://api-docs.akkio.com/concepts/`
- `https://api-docs.akkio.com/endpoints/`
- `https://api.akkio.com/api/v1/api.yaml`

Product docs:

- `https://docs.akkio.com/akkio-docs/rest-api/api-introduction`
- `https://docs.akkio.com/akkio-docs/endpoints-and-schemas/endpoints/`
- `https://docs.akkio.com/akkio-docs/endpoints-and-schemas/schemas`
- `https://docs.akkio.com/akkio-docs/endpoints-and-schemas/additional-libraries/python`
- `https://docs.akkio.com/akkio-docs/concepts/`
- `https://docs.akkio.com/akkio-docs/integrations/`
- `https://docs.akkio.com/akkio-docs/prepare-your-data/prepare`
- `https://docs.akkio.com/akkio-docs/explore/chat-explore`
- `https://docs.akkio.com/akkio-docs/building-a-model/`
- `https://docs.akkio.com/akkio-docs/deploying-a-model/deploy`
- `https://docs.akkio.com/akkio-docs/reporting-and-sharing/`
- `https://docs.akkio.com/akkio-docs/master/akkio-faq`
