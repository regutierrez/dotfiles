# Akkio Legacy Surface

Use this file when you need datasets CRUD or model prediction on the legacy `/v1/...` surface.

## Legacy Surface Summary

- Base URL pattern: `https://api.akkio.com/v1/...`
- Auth style: `api_key` in query params or request body
- Main coverage: dataset CRUD, model listing, model prediction, model deletion
- Important boundary: there is no v2 inference endpoint yet
- These endpoints are not described in the current v2 OpenAPI YAML; treat this section as product-doc-backed guidance for the older surface

Keep legacy code paths separate from v2 code paths so you do not accidentally mix auth styles or URL prefixes.

## Datasets

Base path: `/v1/datasets`

Legacy dataset operations include:

- list datasets
- get a dataset
- create a dataset
- add rows to a dataset
- delete a dataset

Important dataset behavior:

- the first inserted row defines the dataset schema

## Models

Base path: `/v1/models`

Legacy model operations include:

- `GET /v1/models` to list models
- `POST /v1/models` to make predictions
- `DELETE /v1/models` to delete models

Prediction still relies on this legacy surface. Do not go looking for a v2 inference endpoint because the current public docs do not expose one.

## Custom Python Client

Use a thin HTTP client you control.

```python
from __future__ import annotations

from typing import Any

import httpx


LEGACY_BASE_URL = "https://api.akkio.com"


class AkkioLegacyClient:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key.strip()
        self._client = httpx.Client(base_url=LEGACY_BASE_URL, timeout=30.0)

    def close(self) -> None:
        self._client.close()

    def _params(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"api_key": self.api_key, **(extra or {})}

    def _json(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"api_key": self.api_key, **(extra or {})}

    def get_datasets(self) -> Any:
        response = self._client.get("/v1/datasets", params=self._params())
        response.raise_for_status()
        return response.json()

    def get_models(self) -> Any:
        response = self._client.get("/v1/models", params=self._params())
        response.raise_for_status()
        return response.json()

    def make_prediction(self, *, model_id: str, rows: list[dict[str, Any]]) -> Any:
        response = self._client.post(
            "/v1/models",
            json=self._json({"model_id": model_id, "data": rows}),
        )
        response.raise_for_status()
        return response.json()
```

Important custom-client rules:

- keep legacy auth (`api_key`) fully separate from v2 auth (`X-API-Key`)
- use a separate v2 client for Chat Explore, Projects, and Training
- if legacy docs are ambiguous, start with one raw request and inspect the JSON before wrapping more endpoints

## When To Choose Legacy

Use legacy if you need:

- dataset creation and row insertion
- dataset listing or deletion
- model listing
- model prediction/inference
- a thin helper layer over `/v1/...` that you can debug directly
