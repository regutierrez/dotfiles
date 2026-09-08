import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import subagentsLazyTools from "../dot_pi/agent/extensions/subagents-lazy-tools.ts";

const ALL_TOOLS = ["read", "bash", "mcp", "Agent", "SubagentWorkflow", "get_subagent_result", "steer_subagent"];
const DEFAULT_TOOLS = ALL_TOOLS.filter((name) => name !== "SubagentWorkflow");

type TestEvent = { text?: string; prompt?: string };
type TestContext = { sessionManager: { getBranch(): unknown[] }; hasUI: false };
type TestHandler = (event: TestEvent, ctx: TestContext) => unknown;

function createSubagentToolsHarness(options: { registered?: string[]; active?: string[]; branch?: unknown[] } = {}) {
	const registered = options.registered ?? ALL_TOOLS;
	let active = [...(options.active ?? registered)];
	const handlers = new Map<string, TestHandler>();
	const commands = new Map<string, { handler: (args: string, ctx: TestContext) => Promise<void> }>();
	const ctx: TestContext = { sessionManager: { getBranch: () => options.branch ?? [] }, hasUI: false };
	const pi = {
		getAllTools: () => registered.map((name) => ({ name })),
		getActiveTools: () => active,
		setActiveTools: (names: string[]) => { active = names; },
		on: (name: string, handler: TestHandler) => handlers.set(name, handler),
		registerCommand: (name: string, command: { handler: (args: string, ctx: TestContext) => Promise<void> }) => commands.set(name, command),
	};
	subagentsLazyTools(pi as unknown as ExtensionAPI);
	return {
		active: () => active,
		emit: (name: string, event: TestEvent = {}) => {
			const handler = handlers.get(name);
			assert.ok(handler, `Missing event handler: ${name}`);
			return handler(event, ctx);
		},
		command: async (name: string) => {
			const command = commands.get(name);
			assert.ok(command, `Missing command: ${name}`);
			await command.handler("", ctx);
		},
	};
}

test("ordinary Pi subagents stay available before any user request", () => {
	const harness = createSubagentToolsHarness();
	harness.emit("session_start");
	assert.deepEqual(harness.active(), DEFAULT_TOOLS);
	harness.emit("input", { text: "Investigate this bug" });
	harness.emit("before_agent_start", { prompt: "Investigate this bug" });
	assert.deepEqual(harness.active(), DEFAULT_TOOLS);
});

test("skill-triggered Agent delegation needs no keyword activation", () => {
	const harness = createSubagentToolsHarness();
	harness.emit("session_start");
	harness.emit("before_agent_start", { prompt: '<skill name="example">Ask a second reader to check the design.</skill>' });
	assert.deepEqual(harness.active(), DEFAULT_TOOLS);
});

test("past ordinary Agent use does not load the workflow schema on resume", () => {
	const harness = createSubagentToolsHarness({
		branch: [{ type: "message", message: { role: "toolResult", toolName: "Agent" } }],
	});
	harness.emit("session_start");
	assert.deepEqual(harness.active(), DEFAULT_TOOLS);
});

test("past workflow use restores its schema on resume", () => {
	const harness = createSubagentToolsHarness({
		branch: [{ type: "message", message: { role: "toolResult", toolName: "SubagentWorkflow" } }],
	});
	harness.emit("session_start");
	assert.deepEqual(harness.active(), ALL_TOOLS);
});

test("workflow requests load its schema without changing other tools", () => {
	const harness = createSubagentToolsHarness();
	harness.emit("session_start");
	harness.emit("input", { text: "Use a workflow to review this change" });
	assert.deepEqual(harness.active().toSorted(), ALL_TOOLS.toSorted());
	harness.emit("input", { text: "Use a workflow again" });
	assert.equal(harness.active().length, ALL_TOOLS.length);
});

test("the existing subagents command loads the workflow schema", async () => {
	const harness = createSubagentToolsHarness();
	harness.emit("session_start");
	await harness.command("subagents");
	assert.deepEqual(harness.active().toSorted(), ALL_TOOLS.toSorted());
});

test("an absent pi-subagents package does not add tools", async () => {
	const harness = createSubagentToolsHarness({ registered: ["read", "bash"] });
	harness.emit("session_start");
	harness.emit("input", { text: "Use a workflow" });
	await harness.command("subagents");
	assert.deepEqual(harness.active(), ["read", "bash"]);
});

test("explicitly disabled ordinary tools stay disabled", async () => {
	const harness = createSubagentToolsHarness({ active: ["read", "bash"] });
	harness.emit("session_start");
	assert.deepEqual(harness.active(), ["read", "bash"]);
	await harness.command("subagents");
	assert.deepEqual(harness.active(), ["read", "bash", "SubagentWorkflow"]);
});
