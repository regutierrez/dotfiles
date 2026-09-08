import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";

import { buildNvimArguments, parseRequest } from "./open-file.mjs";

function fixtureLink(range = "L75-L97") {
	const directory = mkdtempSync(join(tmpdir(), "pi-file-opener-test-"));
	const filePath = join(directory, "a file.py");
	writeFileSync(filePath, Array.from({ length: 120 }, (_, i) => `${i + 1}\n`).join(""));
	const fileUrl = pathToFileURL(filePath);
	fileUrl.hash = range;
	const destination = new URL("pi-file://open");
	destination.searchParams.set("url", fileUrl.href);
	return { directory, filePath, url: destination.href };
}

for (const [range, startLine, endLine] of [["L75-L97", 75, 97], ["L3", 3, 3], ["", undefined, undefined]]) {
	test(`parses and opens a file in Nvim: ${range || "no selection"}`, () => {
		const fixture = fixtureLink(range);
		try {
			const request = parseRequest(fixture.url);
			assert.deepEqual(request, { filePath: fixture.filePath, startLine, endLine });
			const checks = [
				`call assert_equal('${range ? "V" : "n"}', mode())`,
				"call assert_equal(0, &modified)",
			];
			if (range) {
				checks.push(`call assert_equal(${startLine}, line('v'))`, `call assert_equal(${endLine}, line('.'))`);
			}
			checks.push("if len(v:errors) | echo join(v:errors, '\\n') | cquit | endif", "qa!");
			// Check after VimEnter, when the real editor pane starts accepting terminal input.
			const checkPath = join(fixture.directory, "check.vim");
			writeFileSync(checkPath, [
				"function! CheckNvimSelection(timer)", ...checks, "endfunction",
				"autocmd VimEnter * call timer_start(10, 'CheckNvimSelection')",
			].join("\n"));
			const result = spawnSync("nvim", [
				"--headless", "-u", "NONE", "-i", "NONE", "-S", checkPath, ...buildNvimArguments(request),
			], { encoding: "utf8", timeout: 10000 });
			assert.ifError(result.error);
			assert.equal(result.status, 0, result.stderr);
		} finally {
			rmSync(fixture.directory, { recursive: true });
		}
	});
}

test("accepts absolute paths and file URLs without Pi rewriting the link", () => {
	const fixture = fixtureLink();
	try {
		for (const base of [fixture.filePath, pathToFileURL(fixture.filePath).href]) {
			for (const [suffix, startLine, endLine] of [["", undefined, undefined], ["#L3", 3, 3], ["#L10-L20", 10, 20]]) {
				assert.deepEqual(parseRequest(base + suffix), { filePath: fixture.filePath, startLine, endLine });
			}
		}
		for (const url of ["https://example.com/a.ts", "//example.com/a.ts", "relative/a.ts", "pi-file://other"]) {
			assert.throws(() => parseRequest(url));
		}
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});

for (const range of ["L97-L75", "L0", "L9007199254740992", "not-a-line"]) {
	test(`rejects an invalid range: ${range}`, () => {
		const fixture = fixtureLink(range);
		try {
			assert.throws(() => parseRequest(fixture.url), /source line range/);
		} finally {
			rmSync(fixture.directory, { recursive: true });
		}
	});
}

test("passes the file as an argument, not as editor or shell code", () => {
	assert.deepEqual(buildNvimArguments({ filePath: "/tmp/a' file.py" }), ["--", "/tmp/a' file.py"]);
});

test("only the Nvim child changes to the clicked file's directory", () => {
	const fixture = fixtureLink("");
	try {
		const recorded = join(fixture.directory, "editor.json");
		writeFileSync(join(fixture.directory, "nvim"), `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(recorded)}, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));\n`, { mode: 0o700 });
		const result = spawnSync(process.execPath, [new URL("./open-file.mjs", import.meta.url).pathname, "--editor"], {
			env: { ...process.env, PATH: `${fixture.directory}:${process.env.PATH}`, PI_FILE_OPENER_URL: fixture.url },
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(readFileSync(recorded, "utf8")), {
			cwd: fixture.directory, args: ["--", fixture.filePath],
		});
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});

test("the link action keeps the plugin cwd and passes the clicked URL", () => {
	const fixture = fixtureLink();
	try {
		const herdr = join(fixture.directory, "herdr");
		const recorded = join(fixture.directory, "args.json");
		writeFileSync(herdr, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(recorded)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
		const result = spawnSync(process.execPath, [new URL("./open-file.mjs", import.meta.url).pathname], {
			env: { ...process.env, HERDR_BIN_PATH: herdr, HERDR_WORKSPACE_ID: "w2", HERDR_PLUGIN_CLICKED_URL: fixture.url },
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(readFileSync(recorded, "utf8")), [
			"plugin", "pane", "open", "--plugin", "dotfiles.pi-file-opener", "--entrypoint", "editor",
			"--env", `PI_FILE_OPENER_URL=${fixture.url}`, "--focus",
		]);
		const manifest = readFileSync(new URL("./herdr-plugin.toml", import.meta.url), "utf8");
		assert.match(manifest, /placement = "overlay"/);
		assert.doesNotMatch(manifest, /^(width|height) =/m);
		assert.match(manifest, /id = "absolute-file"/);
		assert.match(manifest, /id = "file-url"/);
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});
