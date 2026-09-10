# Shared-gate evidence ledger

Use the bundled ast-grep workflow when a review changes a shared gate and downstream consumers contain literal keys.

## Build the worksheet

Run from the repository under review. Name only files that own relevant binders, allowlists, replacement maps, schemas, or parameter transformers. Search roots may be broader.

```bash
python /path/to/code-review/scripts/shared_gate_ledger.py inventory \
  --ref <review-head> \
  --consumer-path path/to/consumer.py \
  --search-root path/to/source \
  > /tmp/shared-gate-ledger.json
```

Consumer files are materialized from `--ref` in a temporary directory before scanning, so AST evidence and text searches describe the same revision. The runner uses ast-grep `0.43.0`, matching the version proven in Sentry's Junior repository. It prefers an installed `ast-grep` binary and otherwise runs the pinned `@ast-grep/cli` package through `npx`. That fallback populates npm's local cache but does not modify the reviewed repository.

The Python rule pack extracts literal dictionary keys and literal subscript-assignment keys, normalizing f-string keys such as `segment_name_{index}` into generated families. Inspect consumer files for other dynamic or unsupported construction and pass each known dynamic key with `--key`; ast-grep evidence does not prove completeness by itself.

## Complete the worksheet

For every key:

- fill `producer_evidence`, `producer_requirement`, `phase`, `gate_result`, `downstream_consumer`, and `retry_satisfiability`;
- cite search match IDs in `producer_match_ids` or `post_gate_match_ids`;
- disposition every symbolic match (`:name`, `@name`, or `$name`) in `match_dispositions`;
- use `pre-gate`, `post-gate`, or `unresolved` as the phase.
- use `required`, `allowed`, `forbidden`, or `conditional` for `producer_requirement`; quote the assembled producer contract in `producer_evidence`.

The worksheet marks symbolic matches under prompt/template paths as producer candidates. Every candidate must appear in `producer_match_ids`; the validator rejects a worksheet that dispositions one only as a generic mention, consumer, or family member.

Add every production caller contract and every validation-time transformer erasure row. If no validation-time transformer exists, explain that in `transform_erasure_not_applicable`. Keep unresolved facts explicit.

## Validate before a verdict

```bash
python /path/to/code-review/scripts/shared_gate_ledger.py validate \
  /tmp/shared-gate-ledger.json
```

Validation checks key/search/row parity, required fields, symbolic-match dispositions, and exact-key source evidence. A passing worksheet is evidence completeness, not semantic correctness; the reviewer still owns reachability, phase ordering, behavior, and findings.
