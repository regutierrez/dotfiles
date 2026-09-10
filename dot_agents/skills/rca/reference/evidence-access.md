# Evidence access

Inventory what is actually mounted before planning checks. Work Linear/Datadog evidence uses the `executor` MCP (`http://127.0.0.1:4788/mcp`, `EXECUTOR_API_KEY`). `executor-personal` is a different instance. Code Mode is the primary evidence path in every harness; tool names vary (`mcp__executor__execute` in Claude Code). It still has to be running — if the endpoint is unreachable or the connection is unauthenticated, fall back to `pup` for Datadog and record the gap for Linear. If a tool is absent, the check is unavailable: report it and continue with independent checks rather than substituting an unauthorized path. Never request secrets or start an interactive auth flow (`pup auth login`, `linear-cli auth`) unless the user explicitly asks.

## Linear and Datadog through Code Mode (`mcp__executor__execute`)

Preferred when executor is mounted. The executor exposes its integration catalog as typed APIs inside a sandbox. Discover capability rather than assuming a path — connection names and tool paths change, and an invented endpoint fails as a fabricated check.

1. `tools.search({ query: "<intent and key nouns>", limit: 10 })`. Narrow with `namespace` when the integration is known. It returns `{ items, total, hasMore, nextOffset }`, ranked best-first; page with `offset: nextOffset` rather than raising `limit`.
2. Take `items[0].path` from the intended connection. The `path` is already exact under `tools` — call `tools[path]`, never a guessed segment chain.
3. `tools.describe.tool({ path })` and read `inputTypeScript` / `outputTypeScript`. On `error.code === "tool_not_found"`, use a returned suggestion instead of retrying the same path.
4. `tools[path](args)` with schema-correct, bounded arguments.
5. Branch on `result.ok`: use `result.data` on success; on failure record `result.error` and the resulting access limitation.

Record the discovered path and arguments so another engineer can repeat the check. Executor policy is allow-or-block: writes are blocked, and a blocked tool is a real boundary, not a retry target. If an execution pauses for approval, continue only through `mcp__executor__resume` with the returned payload.

Two sandbox rules that cause confusing failures: the `tools` object is a lazy proxy, so enumerating it (`Object.keys`, spread, `for...in`) throws; and `fetch` is unavailable, because every call goes through `tools.*`.

`mcp__executor__skills` serves the executor's own documentation — `skills({ name: "execute" })` is the authoritative reference for this workflow. Read it before first use rather than guessing an API shape.

### Inventory before searching

`tools.executor.coreTools.connections.list({})` returns the live saved connections as `{ address, integration, owner, name, lastHealth, ... }`. One call answers what evidence actually exists for this run — do it before concluding a source is unavailable, and prefer it over guessing from the starting points below.

Addresses observed previously, to be re-confirmed by the inventory call:

| Address | Use |
| --- | --- |
| `tools.linear_app_graphql.org.workspaceLinearGraphql` | Issue details, comments, attachments |
| `tools.datadoghq_com_v2.org.workspaceDatadoghqApi` | Logs search and aggregation, traces, RUM, metrics, monitors |
| `tools.github_com_graphql.org.workspaceGithubGraphql` | Application source, including reads pinned to a commit sha |
| `tools.github_com_graphql.org.bluDbtRepo` | The dbt transformations repository |
| `tools.dbt_com_graphql.user.hzDbtCloud` | dbt Cloud run history and model deployment state |

A `tools.linear_app.org.*` REST-style Linear connection has also been seen; take whichever the inventory returns. A connection absent from the inventory is unavailable, not hidden: say so and continue. Postgres and Snowflake through executor are not always connected — never present a missing connection as a query that returned nothing.

For Linear, read attachment contents, not just titles.

## Datadog through `pup`

The fallback when executor is not mounted, and the only Datadog path in Claude Code today. Prefer `--output=json` with a bounded `--limit`, and parse with `jq`.

```sh
pup logs aggregate --query='<scoped query>' --from=<range> --compute=count --group-by=<field> --limit=20 --output=json
pup logs search    --query='<scoped query>' --from=<range> --to=<range> --limit=20 --output=json
pup traces search  --query='trace_id:<trace_id>' --from=<range> --output=json
```

Add `pup rum`, `pup events`, `pup metrics`, `pup monitors`, or `pup incidents` only for a specific unresolved question. If no trace id exists, discover candidates from the strongest anchors and inspect only traces connected to the reported action or resource. Capture scoped Datadog URLs for the writeup. An auth or config error is an access limitation to report, not a prompt to authenticate.

## Choosing the shape of the question

For a mechanism question, start from one representative request. For a frequency question, aggregate before fetching samples. Verify that request ids are searched in the fields that actually contain them, and paginate before making any absence or completeness claim. Preserve exact queries, time ranges, grouping, and scoped links.

## Evidence reduction

Reduce where the evidence is produced. Never return a raw collection, complete API envelope, unbounded SQL result, or full set of logs, traces, issues, events, or warehouse rows into context.

- Aggregate and filter inside the Code Mode snippet, the query, or the shell pipeline. Return counts, distributions, chronology, selected fields, identifiers, and a few representative or hypothesis-discriminating samples.
- Project every sample explicitly. Omit bulky payloads; cap individual messages, stack traces, SQL text, and nested attributes unless the complete value is itself the evidence under test.
- Preserve provenance for follow-up: source, time range, query or query hash, total and matched counts, truncation or pagination state, and stable request/trace/log/issue/tenant/project/artifact ids.
- When evidence may exist beyond the returned sample, say how samples were selected and return a cursor, time boundary, identifier, or narrower query plan rather than the omitted records.
- Measure the serialized result before returning it. Where executor stores an oversized result behind a `resultId`, use `refine_executor_result` to reduce the complete stored result without repeating the upstream query; the handle response itself is never evidence.

Broad retrieval inside a snippet or pipeline is fine when aggregation needs it. Broad retrieval as the returned value is not.

## Code evidence

Read code from the environment-matched worktree at a pinned revision, per step 1 of the main skill. `git show <sha>:<path> | nl -ba` gives line numbers that match the citation. `rg` searches the working tree, so confirm any hit against the incident revision before citing it. Cite repository + revision + `file:line`; never cite a branch name as evidence about the incident.

## Reporting gaps

If a tool or connection is missing or unauthenticated, report it as an access limitation together with the check it blocked. Never propose adding a direct provider client, and never present an unavailable check as performed.
