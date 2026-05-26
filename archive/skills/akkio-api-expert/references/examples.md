# Akkio Integration Examples

Use these Python examples as starting points, then adapt them to the surface you need.

## Python `httpx` Client For v2

```python
from __future__ import annotations

import os
import time
from typing import Any

import httpx


BASE_URL = "https://api.akkio.com"


class AkkioAPIError(Exception):
    pass


def create_client(api_key: str) -> httpx.Client:
    return httpx.Client(
        base_url=BASE_URL,
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )


def raise_for_akkio_error(response: httpx.Response) -> None:
    if response.status_code == 401:
        raise AkkioAPIError("Akkio returned 401. Check the X-API-Key header.")
    if response.status_code == 403:
        raise AkkioAPIError("Akkio returned 403. The key lacks access.")
    if response.status_code == 422:
        raise AkkioAPIError(f"Akkio returned 422: {response.text}")
    response.raise_for_status()


def wait_for_task(
    client: httpx.Client,
    status_path: str,
    *,
    poll_interval_seconds: float = 5.0,
    timeout_seconds: float = 300.0,
) -> dict[str, Any]:
    started_at = time.monotonic()

    while True:
        if time.monotonic() - started_at > timeout_seconds:
            raise AkkioAPIError("Timed out while waiting for Akkio task")

        response = client.get(status_path)
        raise_for_akkio_error(response)
        data = response.json()
        if not isinstance(data, dict):
            raise AkkioAPIError("Akkio returned a malformed status payload")

        status = data.get("status")
        metadata = data.get("metadata")

        if status is None:
            raise AkkioAPIError("Akkio status payload is missing 'status'")
        if not isinstance(metadata, dict):
            raise AkkioAPIError("Akkio status payload is missing object 'metadata'")

        if status == "SUCCEEDED":
            return data
        if status == "FAILED":
            raise AkkioAPIError(metadata.get("error", "Akkio task failed"))
        if status == "UNKNOWN_TIMEOUT":
            raise AkkioAPIError("Akkio reported UNKNOWN_TIMEOUT")
        if status not in {"PENDING", "IN_PROGRESS"}:
            raise AkkioAPIError(f"Unexpected task status: {data}")

        time.sleep(poll_interval_seconds)


def get_result_from_location(client: httpx.Client, location: str) -> dict[str, Any]:
    response = client.get(location)
    raise_for_akkio_error(response)
    result = response.json()
    if not isinstance(result, dict):
        raise AkkioAPIError("Akkio returned a malformed chat result payload")

    messages = result.get("messages")
    if not isinstance(messages, list) or not messages:
        raise AkkioAPIError("Akkio returned no chat messages")

    return result


def run_chat_explore(*, api_key: str, project_id: str, question: str) -> dict[str, Any]:
    with create_client(api_key) as client:
        response = client.post(
            "/api/v1/chat-explore/new",
            json={
                "project_id": project_id,
                "messages": [{"role": "user", "content": question}],
            },
        )
        raise_for_akkio_error(response)

        task_id = response.json()["task_id"]
        status_data = wait_for_task(client, f"/api/v1/chat-explore/status/{task_id}")
        location = status_data["metadata"].get("location")
        if not isinstance(location, str) or not location:
            raise AkkioAPIError("Akkio status metadata is missing 'location'")
        return get_result_from_location(client, location)


if __name__ == "__main__":
    result = run_chat_explore(
        api_key=os.environ["AKKIO_API_KEY"],
        project_id=os.environ["AKKIO_PROJECT_ID"],
        question="Give me a simple summary of this data and one useful chart.",
    )
    print(result)
```

If you want stricter schema validation than the helper above:

```python
result = run_chat_explore(...)
missing = {key for key in ("_owner", "_org", "messages") if key not in result}
if missing:
    raise RuntimeError(f"Akkio chat record is missing required keys: {sorted(missing)}")
```

## Legacy Custom Client Example

```python
from __future__ import annotations

from typing import Any

import httpx


class AkkioLegacyClient:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key.strip()
        self._client = httpx.Client(base_url="https://api.akkio.com", timeout=30.0)

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


client = AkkioLegacyClient("YOUR-API-KEY-HERE")
datasets = client.get_datasets()
models = client.get_models()
```

Keep this client thin so you can debug exact requests, auth placement, and payload shapes on the legacy `/v1/...` surface.
