import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { mock } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PI_RENAME_TITLES_ENTRY } from "./pi-session-name.ts";

let completeCalls = 0;
let completion: () => Promise<unknown>;
mock.module("@earendil-works/pi-ai/compat", {
	namedExports: { complete: async () => { completeCalls += 1; return completion(); } },
});
const { default: piRenameExtension } = await import("./index.ts");

type SavedEntry = { type: string; customType?: string; data?: unknown; message?: { role: string; content: string } };
type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function harness(options: { name?: string; entries?: SavedEntry[]; mode?: string; authorized?: boolean } = {}) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
	const entries = options.entries ?? [];
	const reports: string[][] = [];
	const notices: string[] = [];
	let name = options.name;
	const model = { provider: "openai-codex", id: "gpt-5.6-luna" };
	const ctx = {
		mode: options.mode ?? "tui", hasUI: true,
		ui: { notify: (text: string) => notices.push(text) },
		sessionManager: { getEntries: () => entries },
		modelRegistry: {
			find: () => options.authorized === false ? undefined : model,
			hasConfiguredAuth: () => options.authorized !== false,
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-only" }),
		},
	} as unknown as ExtensionContext;
	const pi = {
		on: (event: string, handler: Handler) => handlers.set(event, handler),
		registerCommand: (command: string, definition: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => commands.set(command, definition),
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
		getSessionName: () => name,
		setSessionName: (next: string) => {
			name = next || undefined;
			void handlers.get("session_info_changed")?.({ name }, ctx);
		},
		exec: async (_bin: string, args: string[]) => { reports.push(args); return { code: 0, stderr: "", stdout: "" }; },
	};
	piRenameExtension(pi as unknown as ExtensionAPI);
	return {
		entries, reports, notices, pi,
		name: () => name,
		emit: async (event: string, data: unknown = {}) => { await handlers.get(event)?.(data, ctx); },
		command: async (args: string) => { await commands.get("pi-rename")!.handler(args, ctx); await setImmediate(); },
	};
}

function response(sessionName = "Fix login redirects after session expiry", tabTitle = "Login redirects") {
	return { stopReason: "stop", content: [{ type: "text", text: JSON.stringify({ sessionName, tabTitle }) }] };
}

test.beforeEach(() => {
	mock.property(process, "env", { ...process.env, HERDR_ENV: "1", HERDR_PANE_ID: "test:p1" });
	completeCalls = 0;
	completion = async () => response();
});
test.afterEach(() => mock.restoreAll());

test("first prompt generates both names in one call and reports metadata, never a tab rename", async () => {
	const h = harness();
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "Please fix TRI-42 login redirects" });
	await setImmediate();
	assert.equal(completeCalls, 1);
	assert.equal(h.name(), "Fix login redirects after session expiry");
	const report = h.reports.at(-1)!;
	assert.equal(report[report.indexOf("--title") + 1], "TRI-42");
	assert.equal(report[report.indexOf("--display-agent") + 1], "pi - Fix login redirects");
	assert.ok(report.includes("name2=after session expiry"));
	assert.ok(h.reports.every((args) => args[0] === "pane" && args[1] === "report-metadata"));
	await h.emit("before_agent_start", { prompt: "another question" });
	assert.equal(completeCalls, 1);
});

test("clipboard filenames cannot reach the Herdr title metadata", async () => {
	const path = "/tmp/herdr-clipboard-images-1000/client-4-clipboard-1788803735556435667-0.png";
	completion = async () => response("Fix login redirect", path);
	const h = harness();
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: `${path}\nFix login redirect` });
	await setImmediate();
	const report = h.reports.at(-1)!;
	assert.equal(report[report.indexOf("--title") + 1], "Fix login redirect");
	assert.equal(h.name(), "Fix login redirect");
	assert.ok(!report.some((arg) => arg.includes("herdr-clipboard") || arg.includes("CLIENT-4")));
});

test("bare command uses the latest prompt; reload restores the terse name without another call", async () => {
	const h = harness({ entries: [{ type: "message", message: { role: "user", content: "fix login redirects" } }] });
	await h.emit("session_start");
	await h.command("");
	assert.equal(completeCalls, 1);
	assert.ok(h.reports.at(-1)!.includes("Login redirects"));
	await h.emit("session_shutdown");
	const resumed = harness({ name: h.name(), entries: h.entries });
	await resumed.emit("session_start");
	assert.ok(resumed.reports.at(-1)!.includes("Login redirects"));
	await resumed.emit("before_agent_start", { prompt: "new prompt" });
	assert.equal(completeCalls, 1);
});

test("literal names, built-in /name and clear update both metadata fields without model calls", async () => {
	const h = harness();
	await h.emit("session_start");
	await h.command("Debug AKKIO-99 background jobs");
	assert.equal(h.name(), "Debug AKKIO-99 background jobs");
	assert.ok(h.reports.at(-1)!.includes("AKKIO-99"));
	h.pi.setSessionName("Review authentication middleware behavior today");
	await setImmediate();
	const report = h.reports.at(-1)!;
	assert.equal(report[report.indexOf("--title") + 1], "Review authenticatio");
	assert.equal(h.name(), "Review authentication middleware behavior today");
	await h.command("--clear");
	assert.equal(h.name(), undefined);
	assert.ok(h.reports.at(-1)!.includes("--clear-title"));
	assert.ok(h.reports.at(-1)!.includes("--clear-display-agent"));
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "do not undo clear" });
	assert.equal(completeCalls, 0);
});

test("manual rename wins over an in-flight automatic summary", async () => {
	let finish!: (value: unknown) => void;
	completion = () => new Promise((resolve) => { finish = resolve; });
	const h = harness();
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "old prompt" });
	await setImmediate();
	await h.command("My manual name");
	finish(response("Old generated name", "Old topic"));
	await setImmediate();
	assert.equal(h.name(), "My manual name");
	assert.ok(!h.reports.some((args) => args.includes("Old topic")));
});

test("session shutdown prevents a late model result from renaming a replacement session", async () => {
	let finish!: (value: unknown) => void;
	completion = () => new Promise((resolve) => { finish = resolve; });
	const h = harness();
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "old prompt" });
	await setImmediate();
	await h.emit("session_shutdown");
	finish(response());
	await setImmediate();
	assert.equal(h.name(), undefined);
	assert.ok(!h.entries.some((entry) => entry.customType === PI_RENAME_TITLES_ENTRY));
});

test("clearing an already unnamed session with /name persists across reload", async () => {
	const h = harness();
	await h.emit("session_start");
	h.pi.setSessionName("");
	await setImmediate();
	assert.deepEqual(h.entries.at(-1)?.data, null);
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "leave this unnamed" });
	assert.equal(completeCalls, 0);
});

test("outside Herdr the command works but auto-naming and metadata do not", async () => {
	delete process.env.HERDR_ENV;
	const h = harness();
	await h.emit("session_start");
	await h.emit("before_agent_start", { prompt: "do not auto-name" });
	assert.equal(completeCalls, 0);
	await h.command("Literal session name");
	assert.equal(h.name(), "Literal session name");
	assert.equal(h.reports.length, 0);
});

test("model failures preserve the prompt and deterministic ticket title", async () => {
	completion = async () => { throw new Error("test provider unavailable"); };
	const h = harness({ entries: [{ type: "message", message: { role: "user", content: "Fix ENG-9 login" } }] });
	await h.emit("session_start");
	await h.command("");
	assert.equal(h.name(), "Fix ENG-9 login");
	assert.ok(h.reports.at(-1)!.includes("ENG-9"));
});

test("no auth falls back to prompt and ticket; non-TUI commands never report Herdr metadata", async () => {
	const h = harness({ mode: "print", authorized: false, entries: [
		{ type: "message", message: { role: "user", content: "Fix TRI-17 connection timeout" } },
	] });
	await h.emit("session_start");
	await h.command("");
	assert.equal(h.name(), "Fix TRI-17 connection timeout");
	assert.equal(completeCalls, 0);
	assert.equal(h.reports.length, 0);
	assert.deepEqual(h.entries.at(-1)?.data, { sessionName: "Fix TRI-17 connection timeout", tabTitle: "TRI-17" });
});
