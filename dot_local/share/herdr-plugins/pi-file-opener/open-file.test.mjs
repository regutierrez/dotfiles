import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";

import { fnv1a, parseRequest, selectionExpression, shellQuote } from "./open-file.mjs";

function fixtureLink(range = "L75-L97") {
	const directory = mkdtempSync(join(tmpdir(), "pi-file-opener-test-"));
	const filePath = join(directory, "a file.py");
	writeFileSync(filePath, "test\n");
	const fileUrl = pathToFileURL(filePath);
	fileUrl.hash = range;
	const destination = new URL("pi-file://open");
	destination.searchParams.set("url", fileUrl.href);
	return { directory, filePath, url: destination.href };
}

test("parses an encoded file URL and line range", () => {
	const fixture = fixtureLink();
	try {
		assert.deepEqual(parseRequest(fixture.url), {
			filePath: fixture.filePath,
			startLine: 75,
			endLine: 97,
		});
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});

test("opens a file without a line selection", () => {
	const fixture = fixtureLink("");
	try {
		assert.deepEqual(parseRequest(fixture.url), {
			filePath: fixture.filePath,
			startLine: undefined,
			endLine: undefined,
		});
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});

test("rejects a reversed range", () => {
	const fixture = fixtureLink("L97-L75");
	try {
		assert.throws(() => parseRequest(fixture.url), /reversed/);
	} finally {
		rmSync(fixture.directory, { recursive: true });
	}
});

test("builds the Nvim visual selection without interpolating input", () => {
	assert.equal(
		selectionExpression({ startLine: 75, endLine: 97 }),
		'execute(["execute \\"normal! \\\\<Esc>\\"","call cursor(75, 1)","normal! zvV97Gzz"])',
	);
	assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
});

test("Nvim selects successive ranges and clears selection for a plain file link", () => {
	const script = [
		"call setline(1, range(1, 120))",
		`call ${selectionExpression({ startLine: 75, endLine: 97 })}`,
		"call assert_equal('V', mode())",
		"call assert_equal(75, line('v'))",
		"call assert_equal(97, line('.'))",
		`call ${selectionExpression({ startLine: 3, endLine: 3 })}`,
		"call assert_equal('V', mode())",
		"call assert_equal(3, line('v'))",
		"call assert_equal(3, line('.'))",
		`call ${selectionExpression({})}`,
		"call assert_equal('n', mode())",
		"if len(v:errors) | echo join(v:errors, '\\n') | cquit | endif",
		"qa!",
	].join("\n");
	const directory = mkdtempSync(join(tmpdir(), "pi-file-selection-test-"));
	try {
		const scriptPath = join(directory, "selection.vim");
		writeFileSync(scriptPath, script);
		const result = spawnSync("nvim", ["--headless", "-u", "NONE", "-i", "NONE", "-S", scriptPath], {
			encoding: "utf8",
			timeout: 10000,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stderr);
	} finally {
		rmSync(directory, { recursive: true });
	}
});

test("keeps the legacy socket identity stable for the active editor tab", () => {
	assert.equal(
		fnv1a("/Users/pakkio/.config/herdr/herdr.sock:w1X"),
		"9c0878af579be0bb",
	);
});
