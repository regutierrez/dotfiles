# Vendored pi-mcp

- Upstream: https://github.com/dmmulroy/pi-mcp
- Base revision: `acd1428863dd6ce8ee30371b30f0958e8fb8fbe2`
- Imported: 2026-09-10
- Source: `dot_pi/agent/extensions/pi-mcp/` in the dotfiles repository
- Target: `~/.pi/agent/extensions/pi-mcp/`

This is a source copy, not a Git submodule or a Pi-managed Git package. Pi loads `./src/index.ts` through this directory's package manifest. The dotfiles package list and settings migration remove the old Git package registration. The old checkout is not deleted.

## Included files

The snapshot includes `src/`, `test/`, `conformance/`, the upstream README, package manifest, dependency lockfile, and TypeScript configuration. It excludes upstream agent instructions, development checkouts under `repos/`, Git metadata, GitHub workflows, and generated files. No upstream `LICENSE` or `NOTICE` file exists at the base revision; do not assume the dotfiles repository's license grants rights to this upstream code.

## Local patch

`src/catalog.ts`: `callMcpTool` preserves MCP `content` when `structuredContent` is also present. It appends the serialized structured result only when no text block already contains that exact string. This keeps Executor's emitted text, images, and embedded resources visible to the model. Original content and omission details remain available in result metadata. Tool errors still throw.

`test/mcp-tool-results.test.ts`: eight regression cases cover emitted text, images, embedded resources, exact summary duplicates, structured-only results, unstructured-only results, binary omission details, and error propagation.

## Dependencies and checks

`package.json` and `package-lock.json` retain the upstream dependency versions. The chezmoi hook `run_onchange_after_30-install-pi-mcp.sh.tmpl` runs `npm ci --omit=dev` in the target directory when package metadata changes. It does not install development dependencies on workstation targets.

For development, run from this source directory:

```sh
npm ci
npm run check
npm run test:unit
npm run smoke
npm run smoke:oauth
npm run regression
```

`npm test` also runs the MCP conformance suite through `npx conformance`. Its generated files belong in the ignored `conformance/results/` directory.

## Updating the snapshot

Compare against the recorded base revision before importing another upstream revision. Retain the local output-preservation patch until the same behavior is verified upstream. Preserve notices supplied by upstream and update the revision above. Run the package checks and `node --test scripts/pi-mcp-vendor.test.ts` from the dotfiles root before applying changes. Do not register the upstream Git package alongside this vendored copy.
