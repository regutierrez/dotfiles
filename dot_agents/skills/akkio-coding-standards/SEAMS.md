# Dependencies and how to test around them

The kind of dependency you're touching decides how you test the code around it. Work out the category before designing or testing.

## Dependency map

| Dependency | Category | What to do |
|---|---|---|
| Pure logic: data cleanup, payload builders, SQL building, signatures | In-process | Pull it into its own module next to its test and test it directly through its public functions |
| Postgres | Runs locally | testcontainers — already wired into the Python test harness. Don't fake the repo layer |
| Redis / task-queue broker | Runs locally | testcontainers |
| ML server, called from the web backend | Remote, but ours | The generated API client is the real adapter — pass it in; write a small in-memory fake for tests |
| Web backend, called from the frontend | Remote, but ours | tRPC types are the contract; the frontend never re-declares payload shapes |
| Temporal | Remote, but ours | Use the repo's decorator wrappers; raw `temporalio` decorators are blocked by lint |
| LLM providers | Truly external | Pass the client in; write a small fake class that implements every abstract method |
| Warehouses (Snowflake, Databricks, BigQuery, ClickHouse) | Truly external | Keep query building as plain code and test it well; fake only the call that sends the query |
| Observability SDKs | Truly external | Fake only when importing the real thing breaks the test runner — and say why in a comment at that spot |

## Rules for boundaries

- **Generated-code boundaries are the repo's most important connection points.** Don't build your own client, type copy, or hand-rolled fetch layer next to an existing generated one.
- **An interface with one implementation is a pretend choice.** Add a port/Protocol/interface only when a second implementation is justified — in this repo that's almost always "production + test fake". The repo already has plenty of pointless indirection; don't add more.
- **Keep test hooks private.** A module may accept swap-in helpers for its own tests — don't make them part of its public API, and don't default them to do-nothing objects.
- **Retryable durable work needs a stable key.** If a retry can create a duplicate job, queue message, external write, or database row, the command needs an idempotency key or an equivalent duplicate check.

## Replace tests, don't stack them

When you merge or strengthen thin modules:

- Write new tests at the new module's public functions, then **delete** the old tests that poked the thin pieces. Two layers of tests for the same behavior is waste.
- A good test checks what callers can see and keeps passing when you rework the insides. A test that breaks on an internal rework was reaching too deep.
