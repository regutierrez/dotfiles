---
name: analyzing-excel-files
description: Analyzes Excel workbooks to identify sheets, formulas, macros, hidden structure, data transformations, and migration targets. Use when asked to open, inspect, reverse-engineer, compare, extract from, or document `.xlsx`, `.xlsm`, `.xls`, or `.xlsb` files.
disable-model-invocation: false
---

# Analyzing Excel Files

Use this skill to inspect Excel workbooks safely and systematically before making claims about what they do.

Default stance:

- work read-only unless the user explicitly asks to modify a workbook
- prefer reproducible scriptable inspection over manual guessing
- distinguish formulas from cached values
- check for VBA or hidden workbook behavior before concluding the logic is formula-only

## What This Skill Covers

- workbook inventory
- sheet structure and data shape
- formulas and dependencies
- cached outputs vs live formulas
- hidden rows, hidden columns, merged cells, freeze panes
- VBA macros in `.xlsm`
- comparison of multiple workbooks
- extraction to JSON or CSV fixtures
- migration notes for rewriting workbook logic into code

## File-Type Decision Table

Choose tools based on workbook format.

### `.xlsx` and `.xlsm`

- Use `openpyxl` for structure, formulas, cached values, hidden rows, merged ranges, and sheet metadata.
- For `.xlsm`, load with `keep_vba=True` so the workbook package is preserved during inspection.

### `.xlsm` with possible macro logic

- Use `uvx --from oletools olevba <file>` to extract VBA.
- Use `zipfile` if needed to confirm `vbaProject.bin` exists.

### `.xls`

- Prefer read-only conversion on a copy with LibreOffice headless if native Python readers are unreliable.
- Do not overwrite the original file.
- If conversion is needed, create a sibling temporary export and analyze the export.

### `.xlsb`

- Prefer a Python reader that supports binary Excel, such as `pyxlsb`, if available.
- If not available, use a read-only conversion path on a copy.

## Core Workflow

### 1. Locate The Workbook(s)

Use fast file search first.

```bash
rg --files -g '*.xlsx' -g '*.xlsm' -g '*.xls' -g '*.xlsb'
```

If the user already named the file, go straight to analysis.

### 2. Identify The Analysis Goal

Clarify which of these you are doing:

- understand what the workbook does
- compare two workbooks
- extract tabular data
- find formulas and dependencies
- inspect macros
- prepare fixtures for tests
- plan a migration into code

The goal determines how deep to go.

### 3. Inspect Workbook Structure First

For `.xlsx` or `.xlsm`, inspect:

- sheet names
- row and column counts
- formula counts
- defined names
- hidden rows and columns
- merged ranges
- freeze panes

Do this before reading detailed cells so you know where the important logic likely lives.

### 4. Read Both Formula View And Cached-Value View

For workbooks with formulas, inspect twice:

- `data_only=False` to see formulas
- `data_only=True` to see cached displayed results

Important:

- `openpyxl` does not recalculate formulas
- cached values are only as fresh as the last Excel save

Never assume the cached value is authoritative if the workbook may not have been recalculated recently.

### 5. Identify Inputs, Outputs, And Control Sheets

Look for sheets that behave like:

- raw inputs
- lookup tables
- calculation engines
- formatted summaries
- user-review or trimmed outputs

Common indicators:

- no formulas and compact columns often means input sheet
- many formulas and repeated row templates often means calculation sheet
- formatted strings or schedules often means output sheet

### 6. Sample Representative Rows Instead Of Random Cells

Read:

- header rows
- the first template data row
- the next repeated row if the workbook uses support/midspan or layer patterns
- a few rows where outputs differ or include warnings

Prefer representative row blocks over scattered cell inspection.

### 7. Check For Macro Behavior Before Final Conclusions

If the file is `.xlsm`, extract VBA and answer:

- does VBA only copy/format rows?
- does VBA rename, hide, group, or deduplicate data?
- does VBA perform engineering or business logic not visible in formulas?

Do not describe the workbook as “formula-only” until VBA has been checked.

### 8. Compare Multiple Workbooks Structurally

When two or more files are involved, compare:

- same or different sheet names
- same or different header layouts
- same or different formula patterns
- same or different macros
- same pipeline with different data vs truly different workflows

This is the fastest way to tell whether they are project variants or separate systems.

### 9. Produce A Transformation Map

Summarize the workbook as a pipeline:

- original input contract
- intermediate calculations
- formatted outputs
- trimming, grouping, renaming, or deduplication behavior
- downstream consumers of the output

When the user wants a migration plan, this map is the core deliverable.

### 10. Export Fixtures When Repeatability Matters

If the workbook will become a reference for tests or migration:

- export sheets to CSV for easy browsing
- export JSON for metadata like hidden rows
- keep a manifest describing each exported sheet

Prefer JSON for any sheet where hidden-state or metadata matters.

## Preferred Tools

### Shell And Search

- `rg` for locating workbooks and related source files
- `find` only if needed

### Python Via `uv`

Use `uv run python - <<'PY'` for quick one-off workbook inspection.

Preferred libraries:

- `openpyxl` for `.xlsx` and `.xlsm`
- `pandas` for tabular extraction and fixture comparison
- `zipfile` for workbook package inspection

### Macro Inspection

- `uvx --from oletools olevba <file>` for `.xlsm` VBA extraction

### GUI Fallback

- LibreOffice Calc or Excel for visual spot-checks only when needed

Use GUI checks to confirm formatting or hidden-state behavior, not as the main analysis method.

## Standard Questions To Answer

When analyzing a workbook, aim to answer these explicitly:

1. What are the real input sheets?
2. What are the real output sheets?
3. Which sheets are pure calculation layers?
4. Which cells are user-editable inputs versus computed outputs?
5. Is any business logic implemented in VBA?
6. Are there hidden rows, hidden columns, or duplicate-hiding rules?
7. Are outputs based on formulas, cached values, macros, or a mix?
8. What data shape should code consume if this workflow is migrated?

## Common Pitfalls

Avoid these mistakes:

- assuming cached values are current
- reading only `data_only=True` and missing the formulas
- reading only formulas and missing what users actually see
- ignoring hidden rows in trimmed or reviewed sheets
- treating `.xlsm` as macro-free without checking VBA
- assuming two workbooks differ in logic when they only differ in data
- saving a workbook accidentally during inspection

## Reporting Template

When the user asks for an overview, structure the result like this:

1. workbook comparison summary
2. input contract
3. sheet-by-sheet behavior
4. formulas, macros, and hidden behaviors
5. transformation pipeline
6. migration implications
7. tooling used and recommended

When the user asks for a migration plan, also include:

- what already exists in code
- what still lives only in Excel
- what should be ported first
- what should become fixtures or golden tests

## Minimal Command Patterns

### Inventory A Workbook

Use Python with `openpyxl` to print:

- sheet names
- max rows and columns
- formula counts
- defined names

### Inspect Formula Rows

Read the same sheet twice:

- once with formulas visible
- once with cached values visible

Then compare a representative row.

### Inspect Macros

```bash
uvx --from oletools olevba workbook.xlsm
```

### Export Fixtures

Write:

- one CSV per sheet
- one JSON per sheet including hidden-row metadata
- one manifest per workbook

## When To Go Deeper

Go beyond surface inspection when:

- formulas reference many sheets
- outputs depend on hidden rows or renamed rows
- workbook results are being rewritten into an API or service
- workbook outputs are legal, financial, engineering, or otherwise high-risk

In those cases, capture concrete rows, formulas, and output examples instead of relying on a prose-only summary.

## Deliverables This Skill Should Produce

Depending on the request, produce one or more of:

- workbook overview markdown
- comparison of two or more files
- JSON or CSV exports
- VBA extraction summary
- transformation catalog
- migration plan
- regression-fixture proposal

## Default Recommendation

For any serious Excel reverse-engineering task:

1. inspect structure
2. inspect formulas and cached values
3. inspect VBA if `.xlsm`
4. identify inputs and outputs
5. export fixtures if the workbook will inform code changes

That order avoids shallow conclusions and makes the work reproducible.
