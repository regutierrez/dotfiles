# Bundled Resources

Guide to scripts/, references/, and assets/ directories.

## Resource Type Decision

```
What kind of content?
├─ Executable code → scripts/
├─ Hidden agent tools → toolbox/
├─ External MCP server config → mcp.json
├─ Documentation for agent → references/
└─ Files for output → assets/
```

## scripts/

Executable code the agent runs directly.

**When to include:**
- Same code rewritten repeatedly
- Deterministic operations needed
- Complex validation logic

**Best practices:**
```bash
#!/usr/bin/env bash
set -euo pipefail

# Handle errors
if [[ ! -f "$1" ]]; then
    echo "Error: File not found: $1" >&2
    exit 1
fi
```

**Execution vs reading:**
- "Run `scripts/validate.sh`" → execute
- "See `scripts/validate.sh` for logic" → read

## toolbox/

Executable tools registered only when the skill loads.

**When to include:**
- The skill needs a small, stable command surface
- The same operation would otherwise require pasting command recipes into SKILL.md
- The tool is specific to the skill and should stay hidden until needed

**Best practices:**
- Keep tool names narrow and action-based
- Expose the smallest useful surface area
- Prefer `scripts/` when the agent only needs to run a script directly
- Prefer `toolbox/` when the operation should appear as a dedicated tool

## mcp.json

Per-skill MCP server definition.

**When to include:**
- The skill depends on an MCP server that provides capabilities the base agent does not have
- The server is worth the startup/runtime cost

**Critical rule:** Always filter exposed MCP tools with `includeTools`.

```json
{
  "chrome-devtools": {
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"],
    "includeTools": ["navigate_page", "take_screenshot", "click"]
  }
}
```

**Why this matters:**
- Unfiltered MCP servers can flood startup context with irrelevant tools
- Smaller tool surfaces improve activation precision and reduce token cost
- `includeTools` keeps the skill targeted to its actual workflow

**Do:**
- Start from the exact tasks the skill must perform
- Include only the MCP tools required for those tasks
- Re-check `includeTools` whenever the skill scope changes

**Don't:**
- Expose an entire server by default
- Guess tool names without checking the MCP's docs
- Use MCP when a local `scripts/` or `toolbox/` command is simpler

## references/

Documentation loaded into agent context.

**When to include:**
- Domain knowledge model lacks
- API documentation
- Database schemas
- Detailed workflow guides

**Structure each file:**
```markdown
# Title

Brief overview.

## Contents
- Section 1
- Section 2

## Section 1
...
```

**Size limit:** Target 100-150 lines, max 200.

## assets/

Files used in output, not loaded into context.

**When to include:**
- Templates (`.yaml`, `.json`)
- Images (logos, diagrams)
- Boilerplate code

**Organization:**
```
assets/
├── templates/config.yaml
├── images/logo.png
└── boilerplate/project/
```

Agent copies/uses files without loading into context.

## Comparison

| Directory | Purpose | Token Cost | Agent Action |
|-----------|---------|------------|--------------|
| scripts/ | Automation | Zero | Execute |
| toolbox/ | Hidden per-skill tools | Zero until loaded | Call tool |
| mcp.json | Hidden MCP server tools | Startup/runtime overhead | Call filtered tool |
| references/ | Documentation | When read | Read |
| assets/ | Output files | Zero | Copy/use |

## Platform Compatibility

| Feature | Status |
|---------|--------|
| `toolbox/` protocol | Varies by agent |
| `mcp.json` bundling | Varies by agent |
| `includeTools` filtering | Always use when available |
| Per-skill MCP | Use agent-specific config |

## See Also

- [anatomy.md](./anatomy.md) - Directory structures
- [patterns.md](./patterns.md) - Real skill patterns
