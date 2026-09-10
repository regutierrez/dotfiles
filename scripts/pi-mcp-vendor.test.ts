import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const extensionDir = path.join(root, "dot_pi/agent/extensions/pi-mcp");
const gitPackage = "git:github.com/dmmulroy/pi-mcp";

function renderTemplate(source: string, data: Record<string, unknown> = {}) {
	return execFileSync("chezmoi", ["execute-template", "--override-data", JSON.stringify(data)], {
		cwd: root,
		input: source,
		encoding: "utf8",
	});
}

for (const retired of [gitPackage, { source: gitPackage, extensions: ["src/index.ts"] }]) {
	test(`settings unregister the Git MCP package (${typeof retired}) without changing other packages`, () => {
		const retained = ["npm:other-extension", { source: "npm:filtered-extension", skills: [] }];
		const settings = { packages: [retired, ...retained], defaultModel: "machine-local-model", customSetting: true };
		const template = readFileSync(path.join(root, "dot_pi/agent/modify_settings.json"), "utf8");
		const result = JSON.parse(renderTemplate(template, { chezmoi: { stdin: JSON.stringify(settings) } }));
		assert.deepEqual(result.packages, retained);
		assert.equal(result.defaultModel, settings.defaultModel);
		assert.equal(result.customSetting, settings.customSetting);
	});
}

test("the package installer no longer reinstalls the Git MCP package", () => {
	const packages = JSON.parse(renderTemplate("{{ .packages.pi.extensions | toJson }}"));
	assert(!packages.includes(gitPackage));
});

test("chezmoi preserves the vendored entrypoint, patch, and dependency lockfile", () => {
	const manifest = JSON.parse(readFileSync(path.join(extensionDir, "package.json"), "utf8"));
	assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
	for (const relative of ["src/index.ts", "src/catalog.ts", "package-lock.json"]) {
		const rendered = execFileSync("chezmoi", ["cat", path.join(homedir(), ".pi/agent/extensions/pi-mcp", relative)], {
			cwd: root,
			encoding: "utf8",
		});
		assert.equal(rendered, readFileSync(path.join(extensionDir, relative), "utf8"));
	}
});

test("the vendored dependency hook installs locked runtime dependencies in its target directory", (t) => {
	const temporary = mkdtempSync(path.join(tmpdir(), "pi-mcp-vendor-test-"));
	t.after(() => rmSync(temporary, { recursive: true, force: true }));
	const binDir = path.join(temporary, "bin");
	const targetDir = path.join(temporary, ".pi/agent/extensions/pi-mcp");
	const argumentFile = path.join(temporary, "npm-arguments");
	mkdirSync(binDir);
	mkdirSync(targetDir, { recursive: true });
	writeFileSync(path.join(targetDir, "package-lock.json"), "{}");
	writeFileSync(path.join(binDir, "npm"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$MCP_TEST_NPM_ARGS"\n', { mode: 0o755 });
	const template = readFileSync(path.join(root, "run_onchange_after_30-install-pi-mcp.sh.tmpl"), "utf8");
	execFileSync("bash", ["-s"], {
		input: renderTemplate(template),
		env: { ...process.env, HOME: temporary, PATH: `${binDir}:${process.env.PATH}`, MCP_TEST_NPM_ARGS: argumentFile },
		encoding: "utf8",
	});
	assert.deepEqual(readFileSync(argumentFile, "utf8").trim().split("\n"), ["--prefix", targetDir, "ci", "--omit=dev"]);
});
