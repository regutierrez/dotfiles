---
name: update-pi
description: Update Pi to the latest release, only applying changes when versions drift (global CLI + chezmoi source/target ~/.pi/agent deps).
disable-model-invocation: true
---

# Update Pi Skill

Use this skill when the user asks to upgrade Pi itself.

## What this skill does

1. Finds the latest Pi version from npm.
2. Compares the global CLI version and updates it only if needed.
3. Syncs `@mariozechner/pi-*` deps in the chezmoi source `~/.pi/agent/package.json` only if needed.
4. Runs `bun install` in the chezmoi source only when `package.json` changed.
5. Detects whether the live target `~/.pi/agent` has drift in managed files.
6. Applies the updated source to the live target only when source changed or target drift exists.
7. Runs `bun install` in the live target only when source changed or target drift exists.
8. Verifies final versions and prints a small summary.

## Commands

```bash
set -euo pipefail

# 1) Resolve latest version once
LATEST="$(npm view @mariozechner/pi-coding-agent version)"
TARGET_RANGE="^${LATEST}"
SOURCE_DIR="$(chezmoi source-path)/dot_pi/agent"
TARGET_DIR="${HOME}/.pi/agent"
echo "Latest Pi version: ${LATEST}"
echo "Source dir: ${SOURCE_DIR}"
echo "Target dir: ${TARGET_DIR}"

# 2) Update global CLI only when needed
GLOBAL_CURRENT="$(npm list -g --depth=0 --json 2>/dev/null | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
let v = "";
try {
  const j = JSON.parse(input);
  v = j.dependencies?.["@mariozechner/pi-coding-agent"]?.version || "";
} catch {}
process.stdout.write(v);
')"

GLOBAL_UPDATED=no
if [ "${GLOBAL_CURRENT}" != "${LATEST}" ]; then
  echo "Updating global pi-coding-agent: ${GLOBAL_CURRENT:-<none>} -> ${LATEST}"
  npm install -g "@mariozechner/pi-coding-agent@${LATEST}"
  GLOBAL_UPDATED=yes
else
  echo "Global pi-coding-agent already at ${LATEST}; skipping npm install -g"
fi

# 3) Sync chezmoi source Pi package versions only when drift exists
cd "${SOURCE_DIR}"

PKG_JSON_UPDATED="$(LATEST="${LATEST}" TARGET_RANGE="${TARGET_RANGE}" node -e '
const fs = require("fs");
const path = "package.json";
const target = process.env.TARGET_RANGE;
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
const deps = pkg.dependencies || {};
const names = [
  "@mariozechner/pi-ai",
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-tui"
];
let changed = false;
for (const name of names) {
  if (deps[name] !== target) {
    deps[name] = target;
    changed = true;
  }
}
if (changed) {
  pkg.dependencies = deps;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}
process.stdout.write(changed ? "yes" : "no");
')"

# 4) Refresh source install + lockfile only when package.json changed
SOURCE_BUN_INSTALL_RAN=no
if [ "${PKG_JSON_UPDATED}" = "yes" ]; then
  echo "Source package.json updated; running bun install in ${SOURCE_DIR}"
  bun install
  SOURCE_BUN_INSTALL_RAN=yes
else
  echo "Source package.json already aligned; skipping bun install in ${SOURCE_DIR}"
fi

# 5) Detect live target drift in managed files
TARGET_DRIFT=no
if ! cmp -s "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"; then
  TARGET_DRIFT=yes
elif ! cmp -s "${SOURCE_DIR}/bun.lock" "${TARGET_DIR}/bun.lock"; then
  TARGET_DRIFT=yes
fi

NEEDS_TARGET_SYNC=no
if [ "${PKG_JSON_UPDATED}" = "yes" ] || [ "${TARGET_DRIFT}" = "yes" ]; then
  NEEDS_TARGET_SYNC=yes
fi

# 6) Apply updated source to live target only when source changed or target drift exists
CHEZMOI_APPLY_RAN=no
if [ "${NEEDS_TARGET_SYNC}" = "yes" ]; then
  echo "Applying chezmoi changes to ${TARGET_DIR}"
  chezmoi apply "${TARGET_DIR}"
  CHEZMOI_APPLY_RAN=yes
else
  echo "No source changes or target drift; skipping chezmoi apply"
fi

# 7) Refresh live target install only when source changed or target drift exists
TARGET_BUN_INSTALL_RAN=no
if [ "${NEEDS_TARGET_SYNC}" = "yes" ]; then
  echo "Running bun install in ${TARGET_DIR}"
  cd "${TARGET_DIR}"
  bun install
  TARGET_BUN_INSTALL_RAN=yes
else
  echo "No source changes or target drift; skipping bun install in ${TARGET_DIR}"
fi

# 8) Verify + concise summary
echo "--- Verification ---"
npm list -g --depth=0 | rg '@mariozechner/pi-coding-agent'
echo "Source dependencies:"
cd "${SOURCE_DIR}"
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.dependencies, null, 2))'
echo "Target dependencies:"
cd "${TARGET_DIR}"
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.dependencies, null, 2))'

echo "--- Summary ---"
echo "globalUpdated=${GLOBAL_UPDATED}"
echo "packageJsonUpdated=${PKG_JSON_UPDATED}"
echo "sourceBunInstallRan=${SOURCE_BUN_INSTALL_RAN}"
echo "targetDrift=${TARGET_DRIFT}"
echo "needsTargetSync=${NEEDS_TARGET_SYNC}"
echo "chezmoiApplyRan=${CHEZMOI_APPLY_RAN}"
echo "targetBunInstallRan=${TARGET_BUN_INSTALL_RAN}"
```

## Notes

- Keep the three `@mariozechner/pi-*` dependency versions aligned.
- Treat the chezmoi source as canonical. Update the live target by applying source changes, not by editing `~/.pi/agent/package.json` directly.
- This skill is idempotent: if already up to date, it should do no-op work and report skips clearly.
