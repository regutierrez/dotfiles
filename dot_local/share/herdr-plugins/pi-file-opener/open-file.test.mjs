import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

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
		"execute('call cursor(75, 1) | normal! V22jzz')",
	);
	assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
});

test("keeps the legacy socket identity stable for the active editor tab", () => {
	assert.equal(
		fnv1a("/Users/pakkio/.config/herdr/herdr.sock:w1X"),
		"9c0878af579be0bb",
	);
});
