---
name: update-pi
description: Update Pi to the latest release, only applying changes when versions drift (global CLI + chezmoi source/target ~/.pi/agent deps).
disable-model-invocation: true
---

# Update Pi Skill

Use this skill when the user asks to upgrade Pi itself.

## What this skill does

1. Finds the latest Pi version from npm.
2. Compares the npm-global CLI version and updates it only if needed.
3. Syncs the shared `@earendil-works/pi-*` runtime deps in the chezmoi source.
4. Refreshes source dependencies only when the manifest or installed runtime drifted.
5. Detects whether the live target `~/.pi/agent` has managed-file or installed-runtime drift.
6. Applies only the managed runtime files that drifted.
7. Refreshes the live runtime with npm only when needed.
8. Verifies the CLI, manifests, installed packages, and prints a summary.

## Commands

```bash
set -euo pipefail

SOURCE_DIR="$(chezmoi source-path)/dot_pi/agent"
TARGET_DIR="${HOME}/.pi/agent"
NPM_GLOBAL_PREFIX="${NPM_CONFIG_PREFIX:-${HOME}/.npm-global}"
export PATH="${NPM_GLOBAL_PREFIX}/bin:${PATH}"
PI_BIN="${NPM_GLOBAL_PREFIX}/bin/pi"

for command_name in npm chezmoi node; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

# 1) Resolve latest version once
LATEST="$(npm view @earendil-works/pi-coding-agent version)"
TARGET_RANGE="^${LATEST}"
echo "Latest Pi version: ${LATEST}"
echo "Source dir: ${SOURCE_DIR}"
echo "Target dir: ${TARGET_DIR}"

# 2) Update the npm-global CLI only when needed
GLOBAL_CURRENT="$(npm --prefix "${NPM_GLOBAL_PREFIX}" list -g --depth=0 --json 2>/dev/null | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
let v = "";
try {
  const j = JSON.parse(input);
  v = j.dependencies?.["@earendil-works/pi-coding-agent"]?.version || "";
} catch {}
process.stdout.write(v);
')"

GLOBAL_UPDATED=no
if [ "${GLOBAL_CURRENT}" != "${LATEST}" ]; then
  echo "Updating npm-global pi-coding-agent: ${GLOBAL_CURRENT:-<none>} -> ${LATEST}"
  mkdir -p "${NPM_GLOBAL_PREFIX}"
  npm install --global --ignore-scripts --prefix "${NPM_GLOBAL_PREFIX}" "@earendil-works/pi-coding-agent@${LATEST}"
  if [ "$("${PI_BIN}" --version)" != "${LATEST}" ]; then
    echo "npm-global Pi smoke test did not return ${LATEST}" >&2
    exit 1
  fi
  GLOBAL_UPDATED=yes
else
  echo "npm-global pi-coding-agent already at ${LATEST}; skipping install"
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
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-server",
  "@earendil-works/pi-tui"
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

# Return success only when all shared Pi packages are installed at the expected version.
runtime_is_aligned() {
  local runtime_dir="$1"
  node - "${runtime_dir}" "${LATEST}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [, , runtimeDir, expected] = process.argv;
const names = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-server",
  "@earendil-works/pi-tui"
];

for (const name of names) {
  try {
    const packagePath = path.join(runtimeDir, "node_modules", ...name.split("/"), "package.json");
    const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
    if (version !== expected) process.exit(1);
  } catch {
    process.exit(1);
  }
}
NODE
}

# 4) Refresh the source runtime only when its inputs or installed packages drift
SOURCE_INSTALL_RAN=no
SOURCE_RUNTIME_DRIFT=no
if ! runtime_is_aligned "${SOURCE_DIR}"; then
  SOURCE_RUNTIME_DRIFT=yes
fi

if [ "${PKG_JSON_UPDATED}" = "yes" ] || [ "${SOURCE_RUNTIME_DRIFT}" = "yes" ]; then
  echo "Refreshing ${SOURCE_DIR} with npm"
  npm install --ignore-scripts
  SOURCE_INSTALL_RAN=yes
else
  echo "Source manifest and runtime already aligned; skipping install"
fi

# 5) Detect live target drift in managed files
TARGET_DRIFT=no
if ! cmp -s "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"; then
  TARGET_DRIFT=yes
fi

TARGET_RUNTIME_DRIFT=no
if ! runtime_is_aligned "${TARGET_DIR}"; then
  TARGET_RUNTIME_DRIFT=yes
fi

# 6) Apply only the managed runtime files when they drift
CHEZMOI_APPLY_RAN=no
if [ "${TARGET_DRIFT}" = "yes" ]; then
  echo "Applying package.json to ${TARGET_DIR}"
  chezmoi apply "${TARGET_DIR}/package.json"
  CHEZMOI_APPLY_RAN=yes
else
  echo "Managed target runtime files already match source; skipping chezmoi apply"
fi

# 7) Refresh the live target when its files or installed runtime drift
TARGET_INSTALL_RAN=no
if [ "${TARGET_DRIFT}" = "yes" ] || [ "${TARGET_RUNTIME_DRIFT}" = "yes" ]; then
  echo "Restoring ${TARGET_DIR} with npm"
  cd "${TARGET_DIR}"
  npm install --ignore-scripts
  TARGET_INSTALL_RAN=yes
else
  echo "Live target runtime already aligned; skipping install"
fi

# 8) Verify CLI, managed files, and installed packages
echo "--- Verification ---"
test "$("${PI_BIN}" --version)" = "${LATEST}"
test "$(command -v pi)" = "${PI_BIN}"
cmp -s "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"
runtime_is_aligned "${SOURCE_DIR}"
runtime_is_aligned "${TARGET_DIR}"

echo "Pi binary: $(command -v pi)"
echo "Pi version: $(pi --version)"
echo "Source dependencies:"
cd "${SOURCE_DIR}"
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.dependencies, null, 2))'
echo "Target dependencies:"
cd "${TARGET_DIR}"
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.dependencies, null, 2))'

echo "--- Summary ---"
echo "globalUpdated=${GLOBAL_UPDATED}"
echo "packageJsonUpdated=${PKG_JSON_UPDATED}"
echo "sourceInstallRan=${SOURCE_INSTALL_RAN}"
echo "sourceRuntimeDrift=${SOURCE_RUNTIME_DRIFT}"
echo "targetDrift=${TARGET_DRIFT}"
echo "targetRuntimeDrift=${TARGET_RUNTIME_DRIFT}"
echo "chezmoiApplyRan=${CHEZMOI_APPLY_RAN}"
echo "targetInstallRan=${TARGET_INSTALL_RAN}"
```

## Notes

- Keep the four shared `@earendil-works/pi-*` dependency versions aligned. `pi-server` is explicit because Pi 0.85's coding-agent root imports it without declaring it.
- Pi source now lives in `earendil-works/pi-mono` (packages published under `@earendil-works/*`).
- Treat the chezmoi source as canonical. Update the live target by applying source changes, not by editing `~/.pi/agent/package.json` directly.
- This skill is idempotent: if already up to date, it should do no-op work and report skips clearly.
- npm is the package manager. Keep `--ignore-scripts`: Pi's own installation guidance uses it, and the shared runtime does not require dependency lifecycle scripts.
- Agent-root lockfiles stay untracked. The vendored `extensions/web-tools` package intentionally keeps its own npm lockfile and install script.
- Install the global CLI into `~/.npm-global` so it matches `dot_zshrc.tmpl`.
