import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Client, type CallToolResult } from "@modelcontextprotocol/client";
import { callMcpTool } from "../src/catalog.js";

async function callWithMcpResult(t: TestContext, result: CallToolResult) {
  const client = new Client({ name: "mcp-tool-results-test", version: "1.0.0" });
  t.mock.method(client, "callTool", async () => result);
  return callMcpTool({
    client,
    tool: { name: "execute", inputSchema: { type: "object" } },
    args: {},
    signal: undefined,
  });
}

test("callMcpTool preserves emitted content alongside the structured execution summary", async (t) => {
  const content: CallToolResult["content"] = [
    { type: "text", text: '{"connections":["linear","datadog"]}' },
    { type: "text", text: '{"matches":["query.issue"]}' },
  ];
  const structuredContent = { status: "completed", result: null, emitted: 2, logs: [] };

  const result = await callWithMcpResult(t, { content, structuredContent });

  assert.deepEqual(result.content, [...content, { type: "text", text: JSON.stringify(structuredContent) }]);
  assert.deepEqual(result.details.rawContent, content);
  assert.deepEqual(result.details.structuredContent, structuredContent);
  assert.equal(content.length, 2, "conversion must not append to the original content array");
});

test("callMcpTool preserves emitted images alongside structured output", async (t) => {
  const image = { type: "image" as const, mimeType: "image/png", data: "aW1hZ2U=" };
  const structuredContent = { emitted: 1 };

  const result = await callWithMcpResult(t, { content: [image], structuredContent });

  assert.deepEqual(result.content, [image, { type: "text", text: JSON.stringify(structuredContent) }]);
});

test("callMcpTool converts embedded resources alongside structured output", async (t) => {
  const structuredContent = { emitted: 1 };
  const result = await callWithMcpResult(t, {
    content: [{ type: "resource", resource: { uri: "file:///report.txt", mimeType: "text/plain", text: "report content" } }],
    structuredContent,
  });

  assert.deepEqual(result.content, [
    { type: "text", text: "report content" },
    { type: "text", text: JSON.stringify(structuredContent) },
  ]);
});

test("callMcpTool does not append an exact duplicate structured summary", async (t) => {
  const structuredContent = { ok: true };
  const content: CallToolResult["content"] = [
    { type: "text", text: "additional emitted content" },
    { type: "text", text: JSON.stringify(structuredContent) },
  ];

  const result = await callWithMcpResult(t, { content, structuredContent });

  assert.deepEqual(result.content, content);
});

test("callMcpTool exposes structured-only output without a no-content placeholder", async (t) => {
  const structuredContent = { ok: true };

  const result = await callWithMcpResult(t, { content: [], structuredContent });

  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(structuredContent) }]);
});

test("callMcpTool keeps unstructured-only output unchanged", async (t) => {
  const content: CallToolResult["content"] = [{ type: "text", text: "plain output" }];

  const result = await callWithMcpResult(t, { content });

  assert.deepEqual(result.content, content);
  assert.deepEqual(result.details, { omitted: [], rawContent: content });
});

test("callMcpTool retains binary resource omission details with structured output", async (t) => {
  const result = await callWithMcpResult(t, {
    content: [{ type: "resource", resource: { uri: "file:///report.pdf", mimeType: "application/pdf", blob: "cGRm" } }],
    structuredContent: { emitted: 1 },
  });

  assert.deepEqual(result.details.omitted, ["file:///report.pdf (application/pdf, 3 B)"]);
});

test("callMcpTool still rejects error results that include structured output", async (t) => {
  await assert.rejects(
    () => callWithMcpResult(t, {
      content: [{ type: "text", text: "fixture failure" }],
      structuredContent: { status: "failed" },
      isError: true,
    }),
    /fixture failure/,
  );
});
