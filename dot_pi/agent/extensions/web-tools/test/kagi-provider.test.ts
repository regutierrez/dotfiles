import test from "node:test";
import assert from "node:assert/strict";
import { parseKagiMcpMarkdownResults, parseKagiMcpSearchResponse } from "../providers/kagi.ts";

const MCP_SEARCH_RESPONSE = [
	"event: message",
	`data: ${JSON.stringify({
		jsonrpc: "2.0",
		id: "web-tools-search",
		result: {
			content: [
				{
					type: "text",
					text: [
						"## Search Results",
						"",
						"### [Example Domain](https://example.com/)",
						"**URL:** https://example.com/",
						"**Published:** 2014-10-22",
						"",
						"<strong>Example</strong> snippet.",
						"",
						"### [example.com](https://en.wikipedia.org/wiki/Example.com)",
						"**URL:** https://en.wikipedia.org/wiki/Example.com",
						"",
						"Wikipedia snippet.",
					].join("\n"),
				},
			],
		},
	})}`,
	"",
].join("\n");

test("parseKagiMcpMarkdownResults normalizes Kagi MCP markdown", () => {
	const parsed = parseKagiMcpMarkdownResults([
		"## Search Results",
		"",
		"### [Example Domain](https://example.com/)",
		"**URL:** https://example.com/",
		"**Published:** 2014-10-22",
		"",
		"<strong>Example</strong> snippet.",
	].join("\n"));

	assert.deepEqual(parsed, [
		{
			title: "Example Domain",
			url: "https://example.com/",
			snippet: "Example snippet.",
			publishedAt: "2014-10-22",
			source: "example.com",
		},
	]);
});

test("parseKagiMcpSearchResponse extracts text messages from SSE", () => {
	const parsed = parseKagiMcpSearchResponse(MCP_SEARCH_RESPONSE, "text/event-stream", 1);

	assert.equal(parsed._tag, "ok");
	if (parsed._tag !== "ok") return;
	assert.deepEqual(parsed.value, [
		{
			title: "Example Domain",
			url: "https://example.com/",
			snippet: "Example snippet.",
			publishedAt: "2014-10-22",
			source: "example.com",
		},
	]);
});

test("parseKagiMcpSearchResponse returns safe MCP errors", () => {
	const parsed = parseKagiMcpSearchResponse(
		[
			"event: message",
			`data: ${JSON.stringify({
				jsonrpc: "2.0",
				id: "web-tools-search",
				result: { content: [{ type: "text", text: "Kagi error" }], isError: true },
			})}`,
			"",
		].join("\n"),
		"text/event-stream",
		10,
	);

	assert.deepEqual(parsed, {
		_tag: "err",
		error: { _tag: "SearchProviderReturnedError", provider: "kagi", safeMessage: "Search provider returned an error" },
	});
});
