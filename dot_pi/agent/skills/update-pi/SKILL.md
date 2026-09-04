---
name: update-pi
description: Update Pi to the latest release, only applying changes when versions drift (global CLI + chezmoi source/target ~/.pi/agent deps).
disable-model-invocation: true
---

# Update Pi Skill

Use this skill when the user asks to upgrade Pi itself.

## What this skill does

1. Finds the latest Pi version from the npm registry through Bun.
2. Compares the Bun-global CLI version and updates it only if needed.
3. Syncs the shared `@earendil-works/pi-*` runtime deps and managed `bun.lock` in the chezmoi source.
4. Refreshes source dependencies only when the manifest, lockfile, or installed runtime drifted.
5. Detects whether the live target `~/.pi/agent` has managed-file or installed-runtime drift.
6. Applies only the managed runtime files that drifted.
7. Refreshes the live runtime with the frozen lockfile only when needed.
8. Verifies the CLI, manifests, lockfile, installed packages, and audit result.

## Commands

```bash
set -euo pipefail

SOURCE_DIR="$(chezmoi source-path)/dot_pi/agent"
TARGET_DIR="${HOME}/.pi/agent"
BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
export BUN_INSTALL
export PATH="${BUN_INSTALL}/bin:${PATH}"
PI_BIN="${BUN_INSTALL}/bin/pi"

for command_name in bun chezmoi node; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

# 1) Resolve latest version once through Bun's registry client
LATEST="$(cd "${SOURCE_DIR}" && bun pm view @earendil-works/pi-coding-agent version)"
TARGET_RANGE="^${LATEST}"
echo "Latest Pi version: ${LATEST}"
echo "Source dir: ${SOURCE_DIR}"
echo "Target dir: ${TARGET_DIR}"

# 2) Update the Bun-global CLI only when needed
GLOBAL_CURRENT="$("${PI_BIN}" --version 2>/dev/null || true)"

GLOBAL_UPDATED=no
if [ "${GLOBAL_CURRENT}" != "${LATEST}" ]; then
  echo "Updating Bun-global pi-coding-agent: ${GLOBAL_CURRENT:-<none>} -> ${LATEST}"
  bun add --global --ignore-scripts "@earendil-works/pi-coding-agent@${LATEST}"
  if [ "$("${PI_BIN}" --version)" != "${LATEST}" ]; then
    echo "Bun-global Pi smoke test did not return ${LATEST}" >&2
    exit 1
  fi
  GLOBAL_UPDATED=yes
else
  echo "Bun-global pi-coding-agent already at ${LATEST}; skipping install"
fi

# Remove the retired npm-global Pi only after the Bun-global binary is proven.
LEGACY_NPM_REMOVED=no
LEGACY_NPM_PREFIX="${NPM_CONFIG_PREFIX:-${HOME}/.npm-global}"
LEGACY_NPM_PACKAGE="${LEGACY_NPM_PREFIX}/lib/node_modules/@earendil-works/pi-coding-agent"
if [ -d "${LEGACY_NPM_PACKAGE}" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "Legacy npm-global Pi remains at ${LEGACY_NPM_PACKAGE}; npm is unavailable for cleanup" >&2
    exit 1
  fi
  echo "Removing retired npm-global Pi installation"
  npm --prefix "${LEGACY_NPM_PREFIX}" uninstall --global @earendil-works/pi-coding-agent
  LEGACY_NPM_REMOVED=yes
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

if [ "${PKG_JSON_UPDATED}" = "yes" ] || [ ! -f "${SOURCE_DIR}/bun.lock" ]; then
  echo "Source manifest or lockfile changed; refreshing ${SOURCE_DIR} with Bun"
  bun install --ignore-scripts
  SOURCE_INSTALL_RAN=yes
elif [ "${SOURCE_RUNTIME_DRIFT}" = "yes" ]; then
  echo "Source runtime drifted; restoring it from the frozen lockfile"
  bun install --frozen-lockfile --ignore-scripts
  SOURCE_INSTALL_RAN=yes
else
  echo "Source manifest, lockfile, and runtime already aligned; skipping install"
fi

# 5) Detect live target drift in managed files
TARGET_DRIFT=no
if ! cmp -s "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"; then
  TARGET_DRIFT=yes
elif [ ! -f "${TARGET_DIR}/bun.lock" ]; then
  TARGET_DRIFT=yes
elif ! cmp -s "${SOURCE_DIR}/bun.lock" "${TARGET_DIR}/bun.lock"; then
  TARGET_DRIFT=yes
fi

TARGET_RUNTIME_DRIFT=no
if ! runtime_is_aligned "${TARGET_DIR}"; then
  TARGET_RUNTIME_DRIFT=yes
fi

# 6) Apply only the managed runtime files when they drift
CHEZMOI_APPLY_RAN=no
if [ "${TARGET_DRIFT}" = "yes" ]; then
  echo "Applying package.json and bun.lock to ${TARGET_DIR}"
  chezmoi apply "${TARGET_DIR}/package.json" "${TARGET_DIR}/bun.lock"
  CHEZMOI_APPLY_RAN=yes
else
  echo "Managed target runtime files already match source; skipping chezmoi apply"
fi

# 7) Refresh the live target when its files or installed runtime drift
TARGET_INSTALL_RAN=no
if [ "${TARGET_DRIFT}" = "yes" ] || [ "${TARGET_RUNTIME_DRIFT}" = "yes" ]; then
  echo "Restoring ${TARGET_DIR} from the frozen Bun lockfile"
  cd "${TARGET_DIR}"
  bun install --frozen-lockfile --ignore-scripts
  TARGET_INSTALL_RAN=yes
else
  echo "Live target runtime already aligned; skipping install"
fi

# 8) Verify CLI, managed files, installed packages, lockfile, and audit
echo "--- Verification ---"
test "$("${PI_BIN}" --version)" = "${LATEST}"
test "$(command -v pi)" = "${PI_BIN}"
cmp -s "${SOURCE_DIR}/package.json" "${TARGET_DIR}/package.json"
cmp -s "${SOURCE_DIR}/bun.lock" "${TARGET_DIR}/bun.lock"
runtime_is_aligned "${SOURCE_DIR}"
runtime_is_aligned "${TARGET_DIR}"
cd "${SOURCE_DIR}"
bun install --frozen-lockfile --ignore-scripts --lockfile-only
bun audit

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
echo "legacyNpmRemoved=${LEGACY_NPM_REMOVED}"
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
- Bun is the package manager; Pi still executes on Node.js. Keep `--ignore-scripts`: Pi's own installation guidance uses it, and the shared runtime does not require dependency lifecycle scripts.
- The managed root `bun.lock` makes source and target installs repeatable. The vendored `extensions/web-tools` package intentionally keeps its own npm lockfile and install script.
- `npmCommand: ["bun"]` in Pi settings covers Pi-managed npm packages and dependency installs inside git packages. Their `npm:` source prefix is Pi's package-source syntax, not a requirement to run the npm CLI.
