# Data-layer checks

Read before writing any query.

## Query safety

Run validation queries through `/query-hz`, selecting the Postgres or Snowflake backend, or through an executor Postgres/Snowflake connection when one is mounted. Every validation query must be:

1. **Store-labeled** — name Postgres or Snowflake and explain why the data lives there by tracing its reader and writer.
2. **Environment-matched** — confirm the connection targets the incident environment. Staging and production are separate connections; a staging answer to a production question is a different claim. Stop the query on a mismatch rather than reinterpreting it, and tell the user about the disconnect.
3. **Schema-verified** — confirm table and column names from ORM models, migrations, live schema, or a logged executed query in the environment-matched worktree. Check Postgres `json` versus `jsonb` before choosing operators. Never invent names.
4. **Bounded and read-only** — scope by ids and time, use limits and selective predicates. `LIMIT` alone does not make a full scan or aggregate cheap. Do not run writes or migrations.
5. **Discriminating** — state before execution which results support and which contradict the hypothesis.
6. **Recorded** — retain the validation SQL, the meaningful results, and the relevant original problematic SQL in the writeup, with sensitive data redacted and the redaction labeled.

A current row is not the row's incident-time state. Identify changes, historical snapshots, or uncertainty when reconstructing past behavior. Contradictory results change the conclusion, not the interpretation of the same claim. Production rows are real customer data — carry only what the RCA needs.

## dbt, Snowflake, and supplemental metadata

When data or metadata is implicated, name which of four layers owns the problem before assigning a cause:

1. **Upstream source feed** (TransUnion, Mastercard, Inscape, …) — bad data arrived.
2. **dbt model SQL or YAML** — the transformation or its metadata is wrong.
3. **Snowflake contents** — the model is correct but its run failed, is stale, or built unexpected data.
4. **Platform supplemental-info cache** — live metadata is correct but the model received stale context.

Code that reads data does not prove the data was wrong. Compare live table values, `DESCRIBE TABLE` comments and tags, the supplemental info actually supplied to the request (Datadog logs), and the incident-time model definition. Deployment evidence for transformations comes from dbt Cloud run history, not from Horizon deploys.

The transformations repository is separate from the application repository; the usual checkout is `~/blu-platform-transformations`, but discover the actual one rather than assuming. Fetch history without pulling or altering a worktree you do not own, and read that repository's own `AGENTS.md` before drawing conclusions about its conventions. Its origin is Bitbucket, so `gh` does not apply.

Starting points to verify against the live environment:

- Shared models and templates: `models/blushift_common/`. Client views are generated into `<CLIENT>_CLIENTDATA` schemas; hand-written overrides start with `-- akkio: client-logic`, and a shared bug is fixed in the template, never in one client directory.
- Production schemas may include `BLUSHIFT_HMI_PROD` and `BLUSHIFT_COMMON`; confirm live names before querying.
- YAML descriptions and tags become Snowflake COMMENTs and TAGs, which the platform scrapes into supplemental info and injects into LLM prompts.
- Lookback may depend on `DBT_HISTORY_DAYS`; cadence tags include daily, weekly, monthly. Inspect the actual run configuration.
- Platform metadata builder: `ml/src/dataset_parsing/datasource_info/`.
- Cache refresh tooling: `ml/scripts/refresh_supplemental_info.py`, `ml/scripts/SYNC_COMMON_TABLES.md`.
- Architecture: `apps/docs/docs/by-role/backend/architecture/blushift-dbt-pipeline.md`.

Investigate this path for wrong value formats, missing or incorrect descriptions, per-client table drift, stale rows or partitions, and wrong `data_type` / `use_for_audience_gen` tags. Formatting tags such as `:lower`, `:upper`, `:space-to-hyphen`, and `:space-to-underscore` are claims to verify against actual values, not facts.

Do not run client resyncs, refresh scripts, or dbt deployments as investigation steps.

## Audience and customer-match cases

- Distinguish project name, audience name, audience id, and distribution group id; they are routinely confused in issue reports.
- Recover the actual `audienceSql`. An `Audiences SQL:` log line may describe materialization or cache SQL instead.
- Inspect `audience.sources`, `distribution_invalidity`, and source table metadata after verifying schema.
- For `dv360_only_1p`, inspect `ml/src/audience/distribution/validators/dv360_only_1p.py`, `ml/src/audience/tasks.py`, and the frontend invalidity copy at the incident revision.
- Distinguish a table used for membership and filtering, for projection and labeling, and for identity or key translation.
- Never conclude that a table should be reclassified as client or first-party unless its actual origin justifies that classification.
