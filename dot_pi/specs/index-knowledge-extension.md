# Feature: Index Knowledge Extension

## Problem Statement

**Who:** Senior developers working in large TypeScript/Python monorepos (500k+ lines)

**What:** Creating and maintaining accurate, hierarchical documentation (AGENTS.md, API.md, etc.) is manual, error-prone, and doesn't capture cross-workspace relationships. Existing tools (ctags, grep) lack type information. Vector DBs (Chroma) lose structural context.

**Why it matters:** Junior developers need 2-4 weeks to ramp up on complex codebases. Poor documentation = slower feature delivery, more bugs from misunderstood patterns, knowledge silos when seniors leave.

**Evidence:** The existing `index-knowledge` skill was designed for Claude Code's Task() API, which doesn't exist in pi. Subagent extension exists but lacks LSP integration and incremental update logic needed for 500k line scale.

---

## Proposed Solution

Build a pi extension that:
1. **Extracts semantic knowledge** via LSP (typescript-language-server, basedpyright) for accurate type signatures and resolved imports
2. **Builds a persistent knowledge graph** (repo-index.json) queryable by future LLM sessions
3. **Generates hierarchical documentation** via subagents: AGENTS.md, API.md, ARCHITECTURE.md, MONOREPO.md, plus onboarding docs for junior devs
4. **Supports incremental updates** (manual --full vs default incremental) to handle large codebases efficiently

The extension lives in `~/.pi/agent/extensions/index-knowledge/` and provides:
- `/index-knowledge` command with flags for full/incremental, output formats, model selection
- `query_codebase()` tool for future sessions to search the knowledge graph
- Parallel subagent orchestration for workspace analysis

---

## Scope & Deliverables

| Deliverable | Effort | Depends On | Description |
|-------------|--------|------------|-------------|
| **D1: Extension skeleton + LSP client** | M (4-6h) | - | JSON-RPC client, spawn/monitor tsserver/basedpyright, basic error handling |
| **D2: Knowledge graph types + storage** | M (4-6h) | D1 | RepoIndex interfaces, repo-index.json read/write, state.json for incremental tracking |
| **D3: TypeScript extractor** | L (1-2d) | D2 | LSP queries: workspace symbols, document symbols, hover for types, import resolution |
| **D4: Python extractor + cross-boundary** | L (1-2d) | D3 | basedpyright integration, TS/Python call detection (API boundaries) |
| **D5: Subagent orchestration** | L (1-2d) | D4 | explore/analyze-workspace/verify-boundary agents, parallel task spawning |
| **D6: Documentation generators** | XL (2-3d) | D5 | AGENTS.md, API.md, ARCHITECTURE.md, MONOREPO.md, ONBOARDING.md, TROUBLESHOOTING.md, GLOSSARY.md generators |

**Total Effort:** ~5-6 days (assuming 6-8h productive hours/day)

---

## Non-Goals (Explicit Exclusions)

- **Chroma/vector embeddings:** Out of scope for V1. Knowledge graph is structured JSON, not semantic search. Can add Chroma integration later as optional enhancement.
- **Live file watching:** No inotify/fsevents integration. Manual `/index-knowledge` invocation only.
- **CI/CD integration:** No GitHub Actions, pre-commit hooks, or automated PR checks. Personal use extension.
- **Language servers beyond TS/Python:** No Rust (rust-analyzer), Go (gopls), etc. These can be added as D7, D8, etc.
- **IDE plugins:** No VS Code extension, Zed integration. Command-line via pi only.

---

## Data Model

### repo-index.json
```typescript
interface RepoIndex {
  meta: {
    generatedAt: string;      // ISO timestamp
    lastCommit: string;       // Git SHA
    version: number;          // Schema version
  };
  stats: {
    totalFiles: number;
    totalLines: number;
    languages: { [lang: string]: number };
  };
  workspaces: {
    [path: string]: Workspace;
  };
  files: {
    [path: string]: FileInfo;
  };
  symbols: {
    [symbolId: string]: SymbolInfo;
  };
  clusters: {
    [name: string]: string[]; // symbol IDs grouped by concept
  };
}

interface Workspace {
  path: string;
  name: string;
  language: "typescript" | "python";
  entryPoints: string[];
  exports: string[];        // symbol IDs
  imports: { [symbolId: string]: string }; // symbol -> workspace path
  summary: string;          // AI-generated description
  patterns: string[];         // Detected conventions
  score: number;            // Complexity 1-20
}

interface FileInfo {
  path: string;
  workspace: string;
  language: string;
  size: number;
  hash: string;             // MD5 for incremental detection
  symbols: string[];
  imports: ImportInfo[];
  lastModified: string;
}

interface SymbolInfo {
  id: string;
  name: string;
  kind: "class" | "function" | "interface" | "type" | "variable" | "module";
  filePath: string;
  location: { line: number; character: number };
  signature: string;        // Full type signature
  docstring?: string;
  isExported: boolean;
  usedBy: string[];         // symbol IDs (reverse refs)
  uses: string[];           // symbol IDs (forward refs)
}

interface ImportInfo {
  source: string;           // "@company/core" or "./utils"
  symbols: string[];
  resolvedPath?: string;    // Actual file if resolved
}
```

### state.json (Incremental Tracking)
```typescript
interface IndexState {
  lastFullIndex: string;    // ISO timestamp
  lastIncremental: string;
  lastCommit: string;
  fileHashes: { [path: string]: string };
  dirtyFiles: string[];
  generation: number;
}
```

---

## API/Interface Contract

### Command: `/index-knowledge`

**Syntax:**
```
/index-knowledge [--full] [--max-depth=N] [--workspaces=ws1,ws2] 
                 [--output=agents|api|architecture|monorepo|onboarding|troubleshooting|glossary|all]
                 [--model-explore=MODEL] [--model-analyze=MODEL]
```

**Parameters:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--full` | boolean | false | Force full reindex (ignore incremental state) |
| `--max-depth` | number | 5 | Max directory depth for AGENTS.md generation |
| `--workspaces` | string[] | all | Filter to specific workspace paths |
| `--output` | string | agents | Which doc types to generate |
| `--model-explore` | string | claude-haiku-4-5 | Model for fast recon subagents |
| `--model-analyze` | string | claude-sonnet-4-5 | Model for deep analysis subagents |

**Returns:** Console output with progress + summary of generated files

**Errors:**
- LSP server crash → "TypeScript language server failed to start. Retrying..."
- No workspaces found → "No workspaces detected. Check tsconfig.json / pyproject.toml"
- Permission denied → "Cannot write to .pi/knowledge/. Check permissions"

### Tool: `query_codebase`

**Parameters:**
```typescript
{
  query: string;                    // Search term
  type?: "symbol" | "file" | "workspace" | "pattern" | "cluster";
  limit?: number;                 // Default: 10
  includeDocstrings?: boolean;    // Default: false
}
```

**Returns:**
```typescript
{
  results: Array<SymbolInfo | FileInfo | Workspace>;
  total: number;
  query: string;
  type: string;
}
```

**Example usage:**
```typescript
query_codebase({ query: "AuthProvider", type: "symbol", limit: 5 })
// Returns: SymbolInfo with file location, signature, docstring
```

---

## Acceptance Criteria

- [ ] **AC1:** `/index-knowledge` on 500k line monorepo completes in <6 minutes (full) or <2 minutes (incremental <100 files)
- [ ] **AC2:** Generated AGENTS.md files are 50-150 lines, contain accurate entry points, patterns, and no parent duplication
- [ ] **AC3:** API.md contains all exported functions/classes with correct TypeScript/Python type signatures
- [ ] **AC4:** Cross-workspace imports are resolved correctly (e.g., `@company/core` → `packages/core/src/index.ts`)
- [ ] **AC5:** `query_codebase({type: "symbol", query: "X"})` returns correct file path and line number for any exported symbol
- [ ] **AC6:** Incremental update after 5 file changes completes in <2 minutes and produces same output as full reindex
- [ ] **AC7:** ONBOARDING.md includes: "Day 1 setup", "Key directories", "Common tasks", "Who to ask"
- [ ] **AC8:** Extension handles LSP server crash gracefully with fallback to ctags + warning message

---

## Test Strategy

| Layer | What | How |
|-------|------|-----|
| **Unit** | LSP JSON-RPC parsing, hash generation, scoring algorithm | Jest tests with mock data |
| **Integration** | LSP client ↔ tsserver/basedpyright communication | Test against real sample repos (100, 10k, 100k lines) |
| **E2E** | Full `/index-knowledge` run | Run on 3 repos: small (100 files), medium (10k), large (100k+). Verify output formats, measure timing |
| **Regression** | Incremental vs full consistency | Make 10 random edits, run incremental, run full, diff outputs should match |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **LSP server crashes or hangs on large files** | Medium | High | File size threshold (skip >10k line files), timeout with retry, fallback to ctags |
| **Monorepo path aliases not resolved** | Medium | High | Parse tsconfig.json/paths, test on sample monorepos, fallback to regex import detection |
| **Subagent token limits on large workspaces** | Medium | Medium | Chunk large workspaces into sub-workspaces, summarize before sending to subagent |

---

## Trade-offs Made

| Chose | Over | Because |
|-------|------|---------|
| **LSP (tsserver/basedpyright)** | Direct API (ts-morph/jedi) | User explicitly requested for maximum accuracy, acceptable for personal/non-CI use |
| **Both TS + Python from start** | TS MVP first | User confirmed 50/50 split in their monorepo, consistent API worth parallel effort |
| **Manual --full flag** | Auto-threshold detection | User prefers explicit control, simpler implementation |
| **7 doc types** | Just AGENTS.md | User requested comprehensive junior dev onboarding, effort acceptable (XL) |
| **JSON knowledge graph** | Chroma vectors | Structured data sufficient for V1, semantic search is enhancement |

---

## Open Questions (Non-Blocking)

- [ ] **Q1:** Should repo-index.json be committed to git in the separate docs folder, or gitignored? → Owner: User to decide after first run
- [ ] **Q2:** Which workspace structure should we auto-detect? (turborepo, nx, pnpm-workspace, custom) → Owner: Start with turbo + pnpm, add more on request

---

## Success Metrics

- Full index completes in <6 minutes on user's 500k line monorepo
- Junior developer can answer "where is X?" using query_codebase() in <30 seconds
- AGENTS.md reduces "how do I...?" questions by 50% in first month

---

## Architecture Notes

### LSP Client Design
```typescript
class LSPClient {
  private proc: ChildProcess;
  private requestId = 0;
  private pending = new Map<number, Deferred>();
  
  async connect(cmd: string, args: string[]): Promise<void>;
  async request(method: string, params: unknown): Promise<unknown>;
  async getWorkspaceSymbols(): Promise<SymbolInformation[]>;
  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[]>;
  async getHover(uri: string, position: Position): Promise<Hover | null>;
  
  // Timeout handling: 30s default, retry once on failure
}
```

### Incremental Update Flow
```
1. Read state.json → get lastCommit
2. git diff --name-only lastCommit HEAD → changedFiles
3. For each changed file:
   - Check if in repo-index.json (if new, add; if deleted, remove)
   - Re-extract via LSP
   - Update file hash
4. Find importers of changed symbols (reverse lookup)
5. Re-analyze affected workspaces only
6. Re-generate docs for affected directories
7. Write updated repo-index.json + state.json
```

### Subagent Orchestration
```
Phase 1: Discovery (Parallel)
- Spawn explore subagent per workspace (max 4 concurrent)
- Collect: entry points, patterns, complexity scores

Phase 2: Deep Analysis (Parallel)  
- Spawn analyze-workspace subagent per high-score workspace
- Pass symbol context via query_codebase() tool
- Write draft AGENTS.md per workspace

Phase 3: Cross-Boundary Verification (Sequential)
- Spawn verify-boundary subagent with full import graph
- Flag inconsistencies

Phase 4: Doc Generation (Parallel)
- AGENTS.md: One subagent per qualifying directory
- API.md: One subagent per workspace with exports
- ARCHITECTURE.md: Single subagent with full graph
- MONOREPO.md: Single subagent with workspace relationships
- ONBOARDING.md: Single subagent with beginner perspective
```

---

## Handoff Artifact

# Index Knowledge Extension — Implementation Spec

**Status:** Ready for task breakdown  
**Effort:** 5-6 days  
**Approved by:** @pael (via clarification answers)  
**Date:** 2026-04-12

### Deliverables (Ordered)

1. **[D1]** (M) — Extension skeleton + LSP client
   - Depends on: -
   - Files: `~/.pi/agent/extensions/index-knowledge/index.ts`, `utils/lsp-client.ts`

2. **[D2]** (M) — Knowledge graph types + storage
   - Depends on: D1
   - Files: `types.ts`, `knowledge-graph.ts`, `state.ts`

3. **[D3]** (L) — TypeScript extractor
   - Depends on: D2
   - Files: `extractors/typescript-lsp.ts`

4. **[D4]** (L) — Python extractor + cross-boundary
   - Depends on: D3
   - Files: `extractors/python-lsp.ts`, `extractors/cross-boundary.ts`

5. **[D5]** (L) — Subagent orchestration
   - Depends on: D4
   - Files: `orchestrator.ts`, `subagents/explore.md`, `subagents/analyze-workspace.md`

6. **[D6]** (XL) — Documentation generators
   - Depends on: D5
   - Files: `generators/*.ts` (7 doc types)

### Key Technical Decisions
- **LSP over direct API:** Accuracy priority over speed (5-6min acceptable)
- **Manual --full flag:** Explicit control preferred by user
- **7 doc types:** Comprehensive junior dev onboarding

### Data Model
- RepoIndex with workspaces, files, symbols, clusters
- IndexState for incremental tracking

### Acceptance Criteria
- AC1-AC8 (see above)

### Open Items
- Q1: Git tracking decision → User
- Q2: Additional workspace support → On request

---
*Spec approved for task decomposition.*
