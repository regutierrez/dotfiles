import { accessSync, constants, mkdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const EDITOR_TAB_LABEL = "pi-files";
const LINE_RANGE = /^L([1-9][0-9]*)(?:-L?([1-9][0-9]*))?$/;

export function parseRequest(clickedUrl) {
	const destination = new URL(clickedUrl);
	if (destination.protocol !== "pi-file:" || destination.hostname !== "open") {
		throw new Error("expected a pi-file://open link");
	}

	const rawFileUrl = destination.searchParams.get("url");
	if (!rawFileUrl) throw new Error("source link is missing its file URL");

	const fileUrl = new URL(rawFileUrl);
	if (fileUrl.protocol !== "file:") throw new Error("source link must contain a file URL");

	const match = LINE_RANGE.exec(decodeURIComponent(fileUrl.hash.slice(1)));
	if (!match) throw new Error("source link must end in #L<start>-L<end>");

	const startLine = Number(match[1]);
	const endLine = Number(match[2] ?? match[1]);
	if (endLine < startLine) throw new Error("source line range is reversed");

	const filePath = fileURLToPath(fileUrl);
	let stat;
	try {
		stat = statSync(filePath);
	} catch {
		throw new Error(`source file does not exist: ${filePath}`);
	}
	if (!stat.isFile()) throw new Error(`source path is not a file: ${filePath}`);

	return { filePath, startLine, endLine };
}

export function fnv1a(text) {
	let hash = 0xcbf29ce484222325n;
	for (const byte of Buffer.from(text)) {
		hash ^= BigInt(byte);
		hash = BigInt.asUintN(64, hash * 0x100000001b3n);
	}
	return hash.toString(16).padStart(16, "0");
}

export function shellQuote(value) {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function selectionExpression({ startLine, endLine }) {
	const movement = endLine > startLine ? `${endLine - startLine}j` : "";
	return `execute('call cursor(${startLine}, 1) | normal! V${movement}zz')`;
}

function executable(name) {
	if (name.includes("/")) {
		accessSync(name, constants.X_OK);
		return name;
	}
	for (const directory of (process.env.PATH ?? "").split(":")) {
		const candidate = join(directory, name);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Keep searching PATH.
		}
	}
	throw new Error(`could not find ${name} on PATH`);
}

function run(command, args, { check = true } = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
		env: process.env,
	});
	if (result.error) throw result.error;
	if (check && result.status !== 0) {
		const detail = (result.stderr || result.stdout).trim();
		throw new Error(detail || `${basename(command)} exited with status ${result.status}`);
	}
	return result;
}

function runHerdr(herdr, args) {
	const result = run(herdr, args);
	if (!result.stdout.trim()) return {};
	let response;
	try {
		response = JSON.parse(result.stdout);
	} catch {
		throw new Error(`Herdr returned malformed JSON: ${result.stdout.trim().slice(0, 200)}`);
	}
	if (!response.result) throw new Error("Herdr response did not contain a result");
	return response.result;
}

function nvimSocket(workspace) {
	const identity = `${process.env.HERDR_SOCKET_PATH ?? "default"}:${workspace}`;
	let cacheDirectory;
	if (process.platform === "darwin") {
		// Keep the existing location so an Nvim tab opened by the old macOS handler is reused.
		cacheDirectory = join(homedir(), "Library", "Caches", "PiFileOpener");
	} else {
		cacheDirectory = join(tmpdir(), `pi-file-opener-${process.getuid?.() ?? "user"}`);
	}
	mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
	return join(cacheDirectory, `nvim-${workspace}-${fnv1a(identity)}.sock`);
}

function nvimIsListening(nvim, socket) {
	return run(nvim, ["--server", socket, "--remote-expr", "1"], { check: false }).status === 0;
}

function paneRunsServer(processInfo, socket) {
	return (processInfo.foreground_processes ?? []).some((process) => {
		return (process.argv ?? []).includes(socket) || (process.cmdline ?? "").includes(socket);
	});
}

function paneIsIdleShell(processInfo) {
	const processes = processInfo.foreground_processes ?? [];
	const shells = new Set(["bash", "dash", "fish", "nu", "pwsh", "sh", "zsh"]);
	return processes.length === 0 || processes.every((process) => {
		const name = basename(process.argv0 ?? process.name ?? "");
		return process.pid === processInfo.shell_pid && shells.has(name);
	});
}

function listTabs(herdr, workspace) {
	return runHerdr(herdr, ["tab", "list", "--workspace", workspace]).tabs ?? [];
}

function listPanes(herdr, workspace) {
	return runHerdr(herdr, ["pane", "list", "--workspace", workspace]).panes ?? [];
}

function processInfo(herdr, paneId) {
	return runHerdr(herdr, ["pane", "process-info", "--pane", paneId]).process_info ?? {};
}

function findServerTab(herdr, workspace, socket) {
	for (const pane of listPanes(herdr, workspace)) {
		if (paneRunsServer(processInfo(herdr, pane.pane_id), socket)) return pane.tab_id;
	}
	return undefined;
}

function findAvailableEditorPane(herdr, workspace) {
	const editorTabs = new Set(
		listTabs(herdr, workspace)
			.filter((tab) => tab.label === EDITOR_TAB_LABEL)
			.map((tab) => tab.tab_id),
	);
	for (const pane of listPanes(herdr, workspace)) {
		if (editorTabs.has(pane.tab_id) && paneIsIdleShell(processInfo(herdr, pane.pane_id))) {
			return { paneId: pane.pane_id, tabId: pane.tab_id };
		}
	}
	return undefined;
}

function createEditorTab(herdr, workspace, filePath) {
	const result = runHerdr(herdr, [
		"tab",
		"create",
		"--workspace",
		workspace,
		"--cwd",
		dirname(filePath),
		"--label",
		EDITOR_TAB_LABEL,
		"--no-focus",
	]);
	const paneId = result.root_pane?.pane_id;
	const tabId = result.tab?.tab_id;
	if (!paneId || !tabId) throw new Error("Herdr did not return the new editor tab and pane IDs");
	return { paneId, tabId };
}

function focusTab(herdr, tabId) {
	runHerdr(herdr, ["tab", "focus", tabId]);
}

function openInEditor(request, workspace) {
	const herdr = executable(process.env.HERDR_BIN_PATH ?? "herdr");
	const nvim = executable("nvim");
	const socket = nvimSocket(workspace);

	if (nvimIsListening(nvim, socket)) {
		run(nvim, ["--server", socket, "--remote", request.filePath]);
		const tabId = findServerTab(herdr, workspace, socket);
		if (!tabId) throw new Error("Nvim is running, but its Herdr tab was not found");
		focusTab(herdr, tabId);
		run(nvim, ["--server", socket, "--remote-expr", selectionExpression(request)]);
		return { socket, tabId };
	}

	rmSync(socket, { force: true });
	const target = findAvailableEditorPane(herdr, workspace) ?? createEditorTab(herdr, workspace, request.filePath);
	const command = [
		"exec",
		shellQuote(nvim),
		"--listen",
		shellQuote(socket),
		"--",
		shellQuote(request.filePath),
	].join(" ");
	runHerdr(herdr, ["pane", "run", target.paneId, command]);

	for (let attempt = 0; attempt < 30 && !nvimIsListening(nvim, socket); attempt += 1) {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
	}
	if (!nvimIsListening(nvim, socket)) throw new Error("Nvim did not start listening");
	focusTab(herdr, target.tabId);
	run(nvim, ["--server", socket, "--remote-expr", selectionExpression(request)]);
	return { socket, tabId: target.tabId };
}

export function main() {
	const clickedUrl = process.env.HERDR_PLUGIN_CLICKED_URL;
	const workspace = process.env.HERDR_WORKSPACE_ID;
	if (!clickedUrl) throw new Error("Herdr did not provide the clicked URL");
	if (!workspace || !/^[A-Za-z0-9_-]+$/.test(workspace)) {
		throw new Error("Herdr did not provide a valid workspace ID");
	}
	openInEditor(parseRequest(clickedUrl), workspace);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main();
	} catch (error) {
		console.error(`pi-file-opener: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}
