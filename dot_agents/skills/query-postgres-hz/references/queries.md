# Horizon Postgres — common investigation queries

All examples assume `query-postgres-hz.sh -c '...'` or `psql "$BACKEND_DB_URL" -c '...'`.

## Chart → metadata + datasource org

```sql
SELECT c.id AS chart_id,
       cm.id AS metadata_id,
       cm.title,
       cm.dashboard_id,
       cm.code_hash,
       ds.id AS datasource_id,
       ds.name AS datasource_name,
       ds.organization_id_fs AS datasource_org
FROM chart c
JOIN chart_metadata cm ON c.chart_metadata_id = cm.id
LEFT JOIN datasources ds ON ds.id = cm.datasource_id
WHERE c.id = :chart_id AND c.deleted_at IS NULL;
```

## Chart → dashboard tab(s) via dashboard_items

```sql
SELECT (di.item->'chatChart'->>'chartId')::int AS chart_id,
       cm.title,
       di.dashboard_id,
       d.name AS dashboard_name,
       d.project_id_fs,
       p.id AS project_pk,
       p.name AS project_name
FROM dashboard_items di
JOIN dashboards d ON d.id = di.dashboard_id AND d.deleted_at IS NULL
LEFT JOIN chart c ON c.id = (di.item->'chatChart'->>'chartId')::int
LEFT JOIN chart_metadata cm ON cm.id = c.chart_metadata_id
LEFT JOIN projects p ON p.id::text = d.project_id_fs OR p.id_fs = d.project_id_fs
WHERE di.deleted_at IS NULL
  AND di.item ? 'chatChart'
  AND (di.item->'chatChart'->>'chartId')::int = :chart_id;
```

## Project by integer PK (common for Horizon measurement dashboards)

```sql
SELECT id, id_fs, name, type, deleted_at
FROM projects
WHERE id = :project_id;
```

## All dashboard tabs on a project

```sql
SELECT d.id AS dashboard_id,
       d.name AS dashboard_name,
       d.deleted_at,
       (SELECT count(*)
        FROM dashboard_items di
        WHERE di.dashboard_id = d.id
          AND di.deleted_at IS NULL
          AND di.item ? 'chatChart') AS chart_items
FROM dashboards d
WHERE d.project_id_fs = :project_id::text
ORDER BY d.id;
```

## Tenant from team Firestore ID

```sql
SELECT id AS tenant_pk, name, organization_id_fs
FROM tenants
WHERE organization_id_fs = :team_id;
```

## Code-hash clones (refresh / duplicate charts)

```sql
SELECT c.id AS chart_id, cm.id AS metadata_id, cm.title
FROM chart c
JOIN chart_metadata cm ON c.chart_metadata_id = cm.id
WHERE cm.code_hash = (
  SELECT code_hash FROM chart_metadata cm2
  JOIN chart c2 ON c2.chart_metadata_id = cm2.id
  WHERE c2.id = :chart_id
)
AND c.deleted_at IS NULL
ORDER BY c.id;
```
