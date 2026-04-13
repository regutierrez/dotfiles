# Index Knowledge Extension Spec

## 1. Overview

**Name:** `index-knowledge`  
**Type:** Pi Extension (TypeScript)  
**Purpose:** Generate hierarchical AGENTS.md documentation with maximum accuracy for large monorepos (500k+ lines)

### Key Differentiators
- Multi-language support (TypeScript + Python primary)
- Semantic analysis via LSP/basedpyright (not just AST)
- Incremental updates (not full reindex every time)
- Persistent knowledge graph (queryable by future LLM sessions)
- Cross-boundary analysis (monorepo workspace relationships)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Pi Extension (index-knowledge)          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Command    │  │  Extractors │  │  Knowledge Graph    │ │
│  │  /index-    │  │  ├─ TS LSP  │  │  ├─ repo-index.json │ │
│  │  knowledge  │  │  ├─ Python  │  │  ├─ cache/          │ │
│  └─────────────┘  │  └─ Cross-  │  │  └─ state.json      │ │
│                   │     boundary│  └─────────────────────┘ │
│                   └─────────────┘                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Subagent   │  │  Doc        │  │  Query Tool         │ │
│  │  Orchestrator│  │  Generators │  │  query_codebase()   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                      │                      │
    Spawn subagents       Write AGENTS.md       Return filtered
    for analysis          API.md etc.           results
```

---

## 3. File Structure

```
~/.pi/agent/extensions/index-knowledge/
├── index.ts                    # Main extension entry point
├── commands.ts                 # /index-knowledge command handler
├── types.ts                    # Shared TypeScript interfaces
├── state.ts                    # Index state management (incremental)
├── knowledge-graph.ts          # repo-index.json operations
├── extractors/
│   ├── typescript-lsp.ts       # TypeScript LSP client (tsserver)
│   ├── python-lsp.ts           # Python LSP client (basedpyright)
│   └── cross-boundary.ts       # Merge + detect cross-workspace calls
├── generators/
│   ├── agents-md.ts            # AGENTS.md generator
│   ├── api-md.ts               # API reference generator
│   └── architecture-md.ts      # ARCHITECTURE.md generator
├── subagents/
│   ├── explore.md              # Fast recon agent definition
│   ├── analyze-workspace.md    # Deep workspace analysis
│   └── verify-boundary.md      # Cross-boundary verification
└── utils/
    ├── git.ts                  # Git diff detection
    ├── lsp-client.ts           # Generic LSP JSON-RPC client
    └── scoring.ts              # Directory complexity scoring
```

---

## 4. Data Structures

### 4.1 repo-index.json (Knowledge Graph)

```typescript
interface RepoIndex {
  meta: {
    generatedAt: string;
    lastCommit: string;
    version: number;
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
    [name: string]: string[]; // symbol IDs
  };
}

interface Workspace {
  path: string;
  name: string;
  language: string;
  entryPoints: string[];
  exports: string[]; // symbol IDs
  imports: { [symbolId: string]: string }; // symbol -> workspace
  summary: string;
  patterns: string[];
  score: number; // complexity score for AGENTS.md eligibility
}

interface FileInfo {
  path: string;
  workspace: string;
  language: string;
  size: number;
  hash: string; // for incremental detection
  symbols: string[]; // symbol IDs defined here
  imports: ImportInfo[];
  lastModified: string;
}

interface SymbolInfo {
  id: string;
  name: string;
  kind: 'class' | 'function' | 'interface' | 'type' | 'variable';
  filePath: string;
  location: { line: number; column: number };
  signature: string;
  docstring?: string;
  isExported: boolean;
  usedBy: string[]; // symbol IDs
  uses: string[]; // symbol IDs
}

interface ImportInfo {
  source: string; // module path
  symbols: string[];
  resolvedPath?: string; // actual file if resolved
}
```

### 4.2 Index State (for Incremental Updates)

```typescript
interface IndexState {
  lastFullIndex: string; // ISO timestamp
  lastIncremental: string;
  lastCommit: string;
  fileHashes: { [path: string]: string };
  dirtyFiles: string[]; // files changed since last index
  generation: number;
}
```

---

## 5. Commands

### 5.1 Main Command: `/index-knowledge`

**Syntax:**
```
/index-knowledge [--full] [--incremental] [--max-depth=N] 
                 [--workspaces=ws1,ws2] [--output=agents|api|architecture|all]
                 [--model-explore=MODEL] [--model-analyze=MODEL]
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--full` | false | Regenerate entire index from scratch |
| `--incremental` | true | Only update changed files |
| `--max-depth` | 5 | Maximum directory depth for AGENTS.md generation |
| `--workspaces` | all | Comma-separated list of workspaces to analyze |
| `--output` | agents | Output format: agents, api, architecture, all |
| `--model-explore` | claude-haiku-4-5 | Model for fast exploration subagents |
| `--model-analyze` | claude-sonnet-4-5 | Model for deep analysis subagents |

**Examples:**
```bash
# Quick daily update (30-60s)
/index-knowledge

# Deep refresh after major refactor (5-10min)
/index-knowledge --full --output=all

# Just analyze specific workspaces
/index-knowledge --workspaces=apps/web,packages/core
```

### 5.2 Query Tool: `query_codebase`

**Purpose:** Allow future LLM sessions to query the knowledge graph.

**Parameters:**
```typescript
{
  query: string;           // Search term
  type?: 'symbol' | 'file' | 'workspace' | 'pattern' | 'cluster';
  limit?: number;          // Default: 10
  includeDocstrings?: boolean;
}
```

**Example Usage:**
```typescript
query_codebase({
  query: "AuthProvider",
  type: "symbol",
  limit: 5
})
// Returns: SymbolInfo with file location, signature, docstring

query_codebase({
  query: "authentication",
  type: "cluster"
})
// Returns: Array of symbol IDs in the auth cluster
```

---

## 6. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

**Deliverables:**
- [ ] Extension skeleton (`index.ts`, manifest)
- [ ] LSP client utility (`utils/lsp-client.ts`)
- [ ] Git integration for change detection (`utils/git.ts`)
- [ ] State management (`state.ts`)

**Key Decisions:**
- JSON-RPC client for LSP communication
- State stored in `.pi/knowledge/.index-state.json`
- Knowledge graph in `.pi/knowledge/repo-index.json`

### Phase 2: Language Extractors (Week 1-2)

**Deliverables:**
- [ ] TypeScript LSP extractor (`extractors/typescript-lsp.ts`)
  - Spawn `typescript-language-server`
  - Extract: symbols, types, imports, exports
  - Handle monorepo path aliases
- [ ] Python LSP extractor (`extractors/python-lsp.ts`)
  - Spawn `basedpyright --server`
  - Same extraction capabilities
- [ ] Cross-boundary analyzer (`extractors/cross-boundary.ts`)
  - Merge TS + Python results
  - Detect cross-language calls (API boundaries)

**Output Format:** Populated `repo-index.json`

### Phase 3: Incremental Update Logic (Week 2)

**Deliverables:**
- [ ] `git diff` change detection
- [ ] File hash comparison (fallback for non-git)
- [ ] Dependent cascade: changed file → importers → workspaces
- [ ] Smart threshold: if >100 files changed, auto-switch to full reindex

**Algorithm:**
```
1. Get changed files since last commit
2. For each changed file:
   - Re-extract symbols
   - Find files that import this (reverse lookup)
   - Mark workspace as "needs re-analysis"
3. Re-run cross-boundary analysis on affected workspaces only
4. Update AGENTS.md for touched directories
5. Write new state.json
```

### Phase 4: Subagent Orchestration (Week 3)

**Deliverables:**
- [ ] Agent definitions in `subagents/`
- [ ] Parallel workspace analysis using `subagent` tool
- [ ] Cross-boundary verification agent
- [ ] AGENTS.md generation agent

**Workflow:**
```
1. Discovery: Parallel subagents analyze each workspace
2. Verification: Subagents check cross-boundary consistency
3. Scoring: Main extension calculates directory complexity
4. Generation: Parallel subagents write AGENTS.md files
```

### Phase 5: Documentation Generators (Week 3-4)

**Deliverables:**
- [ ] `generators/agents-md.ts`: Hierarchical coding guides
- [ ] `generators/api-md.ts`: API reference from signatures
- [ ] `generators/architecture-md.ts`: System design docs

**Quality Gates:**
- Generated docs are 50-150 lines max
- No duplication between parent/child AGENTS.md
- Telegraphic style (no fluff)
- Include code examples for non-obvious patterns

### Phase 6: Query Tool & Polish (Week 4)

**Deliverables:**
- [ ] `query_codebase` tool implementation
- [ ] CLI flags for all options
- [ ] Error handling (LSP crashes, partial failures)
- [ ] Performance optimization (caching, batching)

---

## 7. Subagent Definitions

### 7.1 Explore Agent

**File:** `subagents/explore.md`

```yaml
---
name: explore
model: {{model-explore}}
tools: read, grep, find, ls, bash
description: Fast codebase reconnaissance. Find patterns, entry points, and conventions.
---

You are a fast code explorer. Your job is to quickly understand a workspace.

## Tasks
1. Identify entry points (main files, exports)
2. Find naming conventions and patterns
3. Locate configuration files
4. Identify test patterns

## Output Format
Return structured JSON:
```json
{
  "entryPoints": ["src/index.ts", "src/cli.ts"],
  "patterns": ["Custom hooks in src/hooks/", "API clients in src/api/"],
  "conventions": {"naming": "kebab-case for files", "exports": "barrel exports in index.ts"},
  "score": 15
}
```

## Rules
- Be concise. Focus on what's non-obvious.
- Never guess. If unsure, say "unknown".
- Score 1-20 based on complexity (files × uniqueness).
```

### 7.2 Analyze Workspace Agent

**File:** `subagents/analyze-workspace.md`

```yaml
---
name: analyze-workspace
model: {{model-analyze}}
tools: read, write, edit, bash, query_codebase
description: Deep workspace analysis with full symbol context.
---

You have access to the knowledge graph via query_codebase().

## Tasks
1. Read workspace summary from repo-index.json
2. Analyze key symbols and their relationships
3. Identify cross-boundary dependencies
4. Document unique patterns

## Output
Write AGENTS.md directly to workspace directory.
```

### 7.3 Verify Boundary Agent

```yaml
---
name: verify-boundary
model: {{model-analyze}}
tools: read, query_codebase
description: Verify cross-workspace consistency.
---

## Tasks
1. Check that imported symbols exist in source workspaces
2. Verify type consistency across boundaries
3. Flag circular dependencies

## Output
JSON report of issues found (if any).
```

---

## 8. Error Handling & Edge Cases

### LSP Server Crashes
- **Detection:** Timeout on JSON-RPC response
- **Recovery:** Restart server, retry with exponential backoff
- **Fallback:** Use ctags + regex (lower accuracy but functional)

### Partial Failures
- **Scenario:** 1 of 5 workspace subagents fails
- **Behavior:** Log error, continue with 4 workspaces, retry failed one separately
- **Output:** Report which workspaces were skipped

### Large File Detection
- **Threshold:** Files >10k lines
- **Action:** Extract only exports, skip internal functions
- **Rationale:** Prevents LSP timeout, focuses on public API

### Circular Dependencies
- **Detection:** During cross-boundary analysis
- **Action:** Flag in ARCHITECTURE.md, break loop at first occurrence

---

## 9. Performance Targets

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| Full index (500k lines) | 5 min | 10 min |
| Incremental update (<100 files) | 60s | 3 min |
| Query response | 100ms | 500ms |
| Memory usage | <2GB | <4GB |
| repo-index.json size | <50MB | <100MB |

---

## 10. Testing Strategy

### Unit Tests
- LSP client JSON-RPC parsing
- State management (incremental logic)
- Scoring algorithm

### Integration Tests
- Run against sample repos:
  - Small: 100 files
  - Medium: 10k files  
  - Large: 100k files
- Verify AGENTS.md output quality
- Test incremental vs full consistency

### Benchmarks
- Time full index on 500k line codebase
- Measure query latency at different repo sizes
- Memory profiling during extraction

---

## 11. Future Enhancements (Out of Scope for V1)

- [ ] Chroma integration for semantic search
- [ ] Live file watching (auto-update on save)
- [ ] IDE plugin integration (VS Code, Zed)
- [ ] CI/CD integration (fail on doc drift)
- [ ] Multi-repo analysis (cross-repository dependencies)

---

## 12. Open Questions

1. **LSP vs Direct API:** Confirm we're using LSP despite 5-6x slowdown for consistency?
2. **Python:** Confirm basedpyright over jedi?
3. **Incremental threshold:** 100 files or 5000 lines as auto-full-reindex trigger?
4. **Storage:** Store repo-index.json in git or .gitignore?

---

**Status:** Draft  
**Last Updated:** 2026-04-12  
**Estimated Implementation:** 4 weeks (1 developer)
