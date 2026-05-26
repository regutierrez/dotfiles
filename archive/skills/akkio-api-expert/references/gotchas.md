# Akkio Gotchas And Debugging

Use this file when code looks correct but the API still behaves unexpectedly.

## Top Mismatches And Traps

| Issue | Recommendation |
|---|---|
| Prose says `SUBMITTED`; schema says `PENDING` | Trust the schema |
| v2 uses `X-API-Key`; legacy uses `api_key` | Do not mix auth styles |
| Training prose example omits `duration` | Always send `duration` |
| Older quickstarts use `duration: 1` | Use only `10`, `60`, `300`, or `1800` |
| `location` docs are confusing | Inspect the returned string before concatenating URLs |
| Chat Explore examples show `owner` and `org` | Schema uses `_owner` and `_org` |
| `TaskStatusEnum` includes `UNKNOWN_TIMEOUT`, but the metadata discriminator has no dedicated schema for it | Treat it as a terminal error and inspect the raw payload |
| v2 docs do not cover datasets CRUD or prediction | Use legacy docs and a custom `/v1/...` client |
| `_org` and `_owner` are required for project creation but poorly documented | Use the spec or ask Akkio support |
| Images are often described as PNG only | Schema also supports `plotly_json` and object entries |
| Training result docs describe fields like `model_id` | YAML types the response only as generic `object` |
| Many schema objects are open-ended | Allow extra keys in Python models |

## Debugging Checklist

1. Are you calling the correct surface: legacy `/v1/...` or v2 `/api/v1/...`?
2. Are you using `X-API-Key` for v2 instead of `api_key`?
3. Are you polling the correct status path with the correct `task_id`?
4. Are you validating that the status payload actually contains both `status` and `metadata`?
5. Are you handling `PENDING` instead of assuming `SUBMITTED`?
6. Are you treating `UNKNOWN_TIMEOUT` as an error that needs manual inspection?
7. Are you sending every schema-required field, especially training `duration`?
8. Are you using `project_id` when custom instructions matter?
9. Are you resending the full Chat Explore message history each turn?
10. Are you parsing `location` exactly as returned, without double-prefixing?
11. Are you accidentally copying legacy helper behavior into a v2 integration?
12. Is `AKKIO_API_KEY` set, and are you calling `api.akkio.com` instead of a docs URL?
13. Did you verify the endpoint's request and success/error schema names in the YAML?

## What To Log

When debugging, log:

- endpoint path
- HTTP status code
- response body for non-2xx responses
- `task_id`
- final task status
- result `location`

## Safe Defaults

- The first successful async response only means the task was accepted, not completed.
- For machine-facing behavior, trust the schema over prose examples.
- If chat behavior depends on project instructions, prefer `project_id`.
- When you hit ambiguous docs, reduce the problem to one raw HTTP request and inspect the full JSON response.

## Recommended Triage Order

1. Reconfirm the URL and auth style.
2. Reproduce with the smallest possible request.
3. Print the raw status payload during polling.
4. Inspect `metadata.location` exactly as returned.
5. Only after raw calls work, move the logic into helper functions or a client class.
