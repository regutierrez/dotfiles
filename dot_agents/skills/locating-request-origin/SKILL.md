---
name: locating-request-origin
description: Identifies the exact Akkio UI route, primary tab, dashboard sub-tab, and chart or artifact where a logged request started. Use when asked where a request ran, which page/tab/sub-tab to open, or how to reach the same user surface for reproduction.
---

# Locate Request Origin

Find the real user launch point, not only the backend endpoint or feature name. Finish with an evidence-backed path such as `Audience → Insights → Spectrum → Chat with this chart`, plus the IDs needed to reproduce it.

## Workflow

1. **Anchor the request in Datadog.** Search the exact request ID or trace ID and recover the full request payload. Record:
   - HTTP/API route and environment
   - `projectId`, `dashboardId`, datasource/dataset ID
   - `charts` (`chart_id`, `chart_metadata_id`, `chart_data_id` when present)
   - audience/segment IDs
   - `chatExploreMode`, `chat-features`, stream/session ID

   ```bash
   pup logs search \
     --query='@extra.trace_headers.request_id:<request-id>' \
     --from='<bounded-start>' --to='<bounded-end>' \
     --limit=100 --output=json
   ```

   A backend name such as `AudienceExplore` or `chat-features: ["audience-explore"]` identifies processing mode, not the visible tab. A dashboard chat on Audience Insights can use that same backend feature.

2. **Resolve IDs directly in environment-matched Postgres.** Read and follow `~/.agents/skills/query-postgres-hz/SKILL.md`. Run its `envs` command first, then query the same environment as the request.

   If the payload has `dashboardId`, use the dashboard row as the direct source of the sub-tab name:

   ```sql
   SELECT d.id AS dashboard_id,
          d.name AS dashboard_name,
          d.module_type,
          d.project_id_fs,
          p.name AS project_name,
          p.type AS project_type
   FROM dashboards d
   LEFT JOIN projects p
     ON p.id_fs = d.project_id_fs OR p.id::text = d.project_id_fs
   WHERE d.id = :dashboard_id
     AND d.deleted_at IS NULL;
   ```

   If the payload has a chart ID, run:

   ```bash
   ~/.agents/skills/query-postgres-hz/scripts/query-postgres-hz.sh \
     --env <environment> lookup-chart <chart-id>
   ```

   If it has only metadata/data IDs, resolve the clicked chart and containing dashboard through `chart` plus `dashboard_items`:

   ```sql
   SELECT c.id AS chart_id,
          c.chart_metadata_id,
          c.chart_data_id,
          cm.title AS chart_title,
          di.dashboard_id,
          d.name AS dashboard_name,
          d.module_type,
          d.project_id_fs
   FROM chart c
   JOIN chart_metadata cm ON cm.id = c.chart_metadata_id
   LEFT JOIN dashboard_items di
     ON di.deleted_at IS NULL
    AND di.item ? 'chatChart'
    AND (di.item->'chatChart'->>'chartId')::int = c.id
   LEFT JOIN dashboards d
     ON d.id = di.dashboard_id
    AND d.deleted_at IS NULL
   WHERE c.deleted_at IS NULL
     AND (c.chart_metadata_id = :chart_metadata_id OR c.chart_data_id = :chart_data_id)
   ORDER BY c.id DESC;
   ```

   Completion criterion: the persisted dashboard name/module and chart identity are known, or Postgres access is explicitly unavailable.

3. **Map the module to the visible route.** In the environment-matched Akkio worktree, find the route/component that owns `module_type`. Confirm the visible tab title and URL in routing code; do not derive them from ML class names.

   Typical searches:

   ```bash
   rg -n '<module-type>|<component-name>' src/modules/src/services src/modules/src/components
   rg -n 'path:|meta:.*title' src/modules/src/services/routingServices.ts
   ```

   Also trace the launch control when context matters: for chart chat, verify the dashboard's **Chat with this chart** action and the payload builder that sends `dashboardId` and `charts`.

4. **Use runtime correlation only as fallback.** If direct Postgres/API lookup is unavailable:
   - Search RUM around the user/time for `view.url` and click/action events.
   - Search web-backend logs for the project/dashboard ID, module load, dashboard fetch, and chart fetch.
   - If logs show template tab names and generated dashboard IDs, map them only after code proves creation is sequential. Label this inference; direct persisted state is stronger.

5. **Report the result in UI terms.** Include:
   - exact path: product area → tab → sub-tab → action
   - URL suffix when confirmed
   - project, dashboard, chart, metadata/data, and audience/segment IDs
   - backend route separately
   - evidence used and confidence
   - any ambiguity, especially when several charts or dashboards share metadata

## RCA Integration

When this lookup is part of `/rca`, put the confirmed UI origin in the Summary and use it as the start of `## Reproduction steps`. Preserve the request payload IDs and the direct Postgres result in the MDX. If the origin is unresolved, write `Unknown` and name the exact dashboard/chart query needed; never substitute a backend feature name for a UI tab.
