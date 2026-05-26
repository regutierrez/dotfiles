# Akkio Platform Constraints

Use this file for product behavior that changes how an API integration should work.

## Data And Prep

- Data sources mentioned in the docs: CSV, Excel, Snowflake, Salesforce, Google Sheets, BigQuery, HubSpot, PostgreSQL.
- A few hundred rows is a rough minimum; thousands or millions are better when available.
- Default prep behavior includes ISO-8601 date normalization, null cleanup, collapsing excess categories to `Other`, and removing constant or mostly blank columns.
- Chat-based data prep can misinterpret prompts, so review generated transformations before applying them.

## Chat Explore Constraints

- Chat Explore can return summaries, charts, tables, and images.
- It does not work directly on merged datasets; the workaround is download and re-upload.
- Akkio uses GPT through a private Azure deployment and sends schema, types, sample values, and metadata rather than blindly sending raw data.

## Model And Forecasting Notes

- Standard prediction covers classification and regression.
- Forecasting requires a time field; multi-series can also use an ID field.
- Each forecasting subsequence needs at least 5 dates.
- UI training tiers map to API `duration` values.
- Missing prediction-time fields are treated as nulls.
- Overfitting is handled with k-fold cross-validation.
- Feature correlations are not currently supported.
- Class imbalance is mainly handled by model choice rather than SMOTE or class weights.

## Deployment Notes

- Deployment targets include Web App, API, Zapier, Salesforce, Google Sheets, BigQuery, HubSpot, and PostgreSQL.
- Billing is per predicted row; model creation itself does not count as a prediction.

## PostgreSQL Integration

Hierarchy reminder:

```text
Postgres server -> database -> schema -> table
```

- Import is beta.
- Allowlist Akkio IP `54.197.189.139`.
- Import needs read permissions; deploy needs write permissions.
- PostgreSQL deployment works only for models trained on PostgreSQL-imported data.
- Predictions are written to `<table>_akkio_predictions`.
- Docs blur `database` and `schema`, so verify exact meanings during setup.

## Operational Notes

- Rate guidance is about `5 req/s`; bulk behavior is case-dependent.
- Integrated data refresh runs daily at `12am UTC`.
- Data is encrypted at rest and in flight.
- Docs cite SOC 2 Type II, GDPR, and HIPAA compliance.
- API features depend on the plan.
- Chat via API is documented around 250 downstream users and 5 concurrent chats.
