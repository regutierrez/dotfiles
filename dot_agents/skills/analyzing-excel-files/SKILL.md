---
name: analyzing-excel-files
description: Analyzes Excel workbooks to identify structure, formulas, hidden behavior, macros, and exportable fixtures. Use when asked to inspect, compare, reverse-engineer, extract from, or document `.xlsx`, `.xlsm`, `.xls`, or `.xlsb` files.
disable-model-invocation: false
---

# Analyzing Excel Files

Inspect workbooks read-only and prefer scripts over ad hoc guessing.

Use this skill when asked to:

- open or inspect Excel files
- compare two workbooks
- find formulas, outputs, or hidden behavior
- inspect `.xlsm` macros
- extract workbook data into fixtures
- reverse-engineer a workbook for migration into code

## Workflow

1. Run `scripts/inventory_workbook.py` to map sheets, sizes, formulas, and hidden structure.
2. Run `scripts/show_row.py` on representative rows in both formula and cached-value modes.
3. If the file is `.xlsm`, run `uvx --from oletools olevba <file>` before claiming the logic is formula-only.
4. If the workbook will drive code or tests, run `scripts/export_workbook.py` to create JSON and CSV fixtures.

## What To Identify

- real input sheets
- calculation sheets
- final output sheets
- user-editable inputs vs computed cells
- hidden rows, hidden columns, and trimmed views
- macro behavior that changes data, naming, grouping, or visibility

## Rules

- Do not assume cached values are current.
- Distinguish formula view from cached-value view.
- Distinguish inputs, calculation sheets, and outputs.
- Check hidden rows and columns before summarizing trimmed or reviewed sheets.
- Prefer representative row blocks over random individual cells.
- Treat `.xlsm` as potentially macro-driven until VBA is checked.
- For `.xls` or `.xlsb`, analyze via a read-only conversion or a format-specific reader on a copy.

## Script Usage

```bash
uv run scripts/inventory_workbook.py workbook.xlsm
uv run scripts/show_row.py workbook.xlsm SHEET_NAME 12
uv run scripts/export_workbook.py workbook.xlsm ./workbook-export
uvx --from oletools olevba workbook.xlsm
```

## Standard Questions

1. What is the workbook's actual input contract?
2. Which sheets are doing computation versus formatting?
3. Is any business logic implemented in VBA?
4. Are outputs affected by hidden rows, renaming, or duplicate handling?
5. What data shape should code consume if this workbook is migrated?

## Deliverables

- workbook overview
- workbook comparison (if given two files to compare against)
- transformation map
- VBA summary
- export fixtures
- migration plan

## Default Recommendation

For serious reverse-engineering work, always do this in order:

1. inventory the workbook
2. inspect formulas and cached values on representative rows
3. inspect VBA if `.xlsm`
4. export fixtures if the workbook will influence code or tests
