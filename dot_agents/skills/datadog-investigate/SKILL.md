---
name: datadog-investigate
description: Drive the `pup` Datadog CLI efficiently when investigating a single incident — find the request_id, expand to the full trace, cross-reference downvotes/triage, and complete a writeup checklist. Use when a Linear ticket / user-feedback / incident must be traced to root cause. Pairs with investigatr-authoring; do not use for metric dashboards or general APM exploration.
---

## Authentication & sanity

`pup` is normally pre-authenticated. If a command errors with auth, stop and tell the user — don't attempt `pup auth login` (interactive). Always pass `--output json` and parse with `uv` / `jq` rather than eyeballing.

## Discovery ladder (run in order, stop when you have what you need)

1. **Anchor on the strongest user identifier.** Email, uid, or org id. Aggregate first to enumerate candidate request_ids — this is much cheaper than dumping logs.
   ```
   pup logs aggregate \
     --query='env:<env> service:<svc> @extra.auth.email:<email>' \
     --compute=count --group-by=@extra.trace_headers.request_id \
     --from=14d --limit=20 --output=json
   ```
2. **Narrow to the incident with a domain keyword from the ticket** (a dataframe name, audience id, error string). One `logs search` should pull the rich payload log line that contains the SQL/prompt/result.
   ```
   pup logs search \
     --query='env:<env> @extra.auth.email:<email> "<keyword>"' \
     --from=14d --limit=20 --output=json
   ```
3. **Pull the "Done"/completion log for that request_id.** This is usually the single fattest log message and contains the assistant text, generated code, result metadata, S3 keys, and the `@dd.trace_id`.
   ```
   pup logs search --query='env:<env> "<request_id>" Done' --from=14d --limit=3 --output=json
   ```
4. **Expand to the trace once you have a `@dd.trace_id`.**
   ```
   pup traces search --query='trace_id:<trace_id>' --from=14d --output=json
   pup traces search --query='trace_id:<trace_id> service:*snowflake* OR resource_name:*' --output=json
   ```
   The trace surfaces span-level data (Snowflake `sfqid`, warehouse, downstream service hops) that does not appear in logs.

## Cross-validation rule (prevents the streamId-mismatch class of error)

`pup logs search` is text-based; a broad keyword can grab a *different turn from the same user*. Before declaring a finding, verify that any secondary id you report (`streamId`, `payload_id`, child `request_id`) appears **in the same log line** as the primary `request_id`, not just in nearby results. If a field is sourced from a different log entry, label it as such or drop it.

## Recipe table

| Need | Command sketch |
|---|---|
| User's recent activity, grouped by request_id | `pup logs aggregate --compute=count --group-by=@extra.trace_headers.request_id` |
| Verbatim user prompt + generated SQL/code | `pup logs search --query='"<keyword>"'` then parse the largest message |
| Final assistant text + result metadata | `pup logs search --query='"<request_id>" Done'` |
| Downvote / negative rating events | `pup logs search --query='"<request_id>" rating OR thumbs_down OR negative'` |
| Auto-triage entry created from the incident | `pup logs search --query='env:<env> service:<triage-svc> "<short title fragment>"'` |
| Span tree with Snowflake / external calls | `pup traces search --query='trace_id:<trace_id>'` |
| Snowflake query id / warehouse | filter trace results to spans with `db.*` attributes; pick the executing span's `@db.statement_id` / `@db.warehouse` |
| Sibling occurrences of the same bug | `pup logs aggregate --query='"<sql fragment>"' --compute=count --group-by=@extra.auth.email --from=30d` |

## Completeness checklist (must be filled before writeup)

Refuse to declare done until each row has a value or an explicit `Unknown — <reason>`:

- [ ] Primary `request_id`
- [ ] `trace_id` (and at least one span_id from the trace)
- [ ] `stream_id` / `payload_id` — verified to co-occur with the primary request_id
- [ ] User: email, uid, org id
- [ ] Timestamp in UTC **and** ET
- [ ] Service + env + build/commit (look for `@extra.image` or `@version`)
- [ ] Verbatim user input (prompt, params, body)
- [ ] The actual code/SQL/payload that ran (not paraphrased)
- [ ] The actual result the user saw (row counts, error text, response body)
- [ ] Where the bad value originated (LLM output? deterministic count? upstream API?) — be specific about the *step* that produced it
- [ ] Downvote/rating event id, if applicable
- [ ] Auto-triage / Linear creation log entry, if applicable
- [ ] Snowflake / external-system identifiers from the trace (sfqid, warehouse, schema) when relevant
- [ ] Project / resource / audience names — not just ids — pulled from the same payload

If a checklist row required a separate command, list that command in the writeup's "Evidence pointers" section.

## Token discipline

- Always pass `--output=json` and `--limit=N` with a small N (3–5 for `Done` lookups, 20 for aggregations). Never let `pup logs search` dump unbounded results.
- Pipe large JSON through `python3 -c '…'` to extract only the fields you need before reading. Do not Read large saved JSON files end-to-end.
- One well-targeted `logs search` for the rich payload log + one `traces search` is usually all you need beyond the initial aggregate. If you find yourself on the fifth `logs search`, stop and rethink the query.

## Writeup format

The output should be three sections — `What happened`, `Why it happened`, `Evidence pointers (commands + outputs)` — followed by the completeness checklist filled in. Quote SQL/code/payloads verbatim; do not summarize. Cite span ids and log timestamps for every infrastructure claim.
