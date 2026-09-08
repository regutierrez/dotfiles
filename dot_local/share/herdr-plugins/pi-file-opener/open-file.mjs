import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const LINE_RANGE = /^L([1-9][0-9]*)(?:-L?([1-9][0-9]*))?$/;

/** Validate the clicked file URL on the host that runs the Herdr session. */
export function parseRequest(clickedUrl) {
	let fileUrl;
	if (clickedUrl.startsWith("/") && !clickedUrl.startsWith("//")) {
		fileUrl = new URL(`file://${clickedUrl}`);
	} else {
		const destination = new URL(clickedUrl);
		if (destination.protocol === "pi-file:" && destination.hostname === "open") {
			const rawFileUrl = destination.searchParams.get("url");
			if (!rawFileUrl) throw new Error("source link is missing its file URL");
			fileUrl = new URL(rawFileUrl);
		} else {
			fileUrl = destination;
		}
	}
	if (fileUrl.protocol !== "file:") throw new Error("source link must contain a file URL");

	const match = LINE_RANGE.exec(decodeURIComponent(fileUrl.hash.slice(1)));
	if (fileUrl.hash && !match) throw new Error("source line range must be #L<start>-L<end>");

	const startLine = match ? Number(match[1]) : undefined;
	const endLine = match ? Number(match[2] ?? match[1]) : undefined;
	if (match && (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine))) {
		throw new Error("source line range exceeds safe integer limits");
	}
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

/** Select the clicked file's line range after Nvim finishes startup. */
export function buildNvimArguments({ filePath, startLine, endLine }) {
	const args = [];
	if (startLine !== undefined) {
		args.push("-c", `autocmd VimEnter * call cursor(${startLine}, 1) | normal! zvV${endLine}Gzz`);
	}
	return [...args, "--", filePath];
}

/** The link action opens an overlay pane; Herdr owns zoom and focus restoration. */
export function main() {
	const editor = process.argv[2] === "--editor";
	const clickedUrl = editor ? process.env.PI_FILE_OPENER_URL : process.env.HERDR_PLUGIN_CLICKED_URL;
	if (!clickedUrl) throw new Error("Herdr did not provide the clicked URL");
	const request = parseRequest(clickedUrl);

	if (editor) {
		const result = spawnSync("nvim", buildNvimArguments(request), {
			stdio: "inherit",
			cwd: dirname(request.filePath),
		});
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
		return;
	}

	// Keep the plugin cwd so Herdr can resolve the relative editor entrypoint.
	// Overlay placement uses the active pane; Herdr rejects explicit layout targets.
	const result = spawnSync(process.env.HERDR_BIN_PATH ?? "herdr", [
		"plugin", "pane", "open",
		"--plugin", "dotfiles.pi-file-opener",
		"--entrypoint", "editor",
		"--env", `PI_FILE_OPENER_URL=${clickedUrl}`,
		"--focus",
	], { encoding: "utf8" });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error((result.stderr || result.stdout).trim() || "Herdr could not open the Nvim overlay pane");
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main();
	} catch (error) {
		console.error(`pi-file-opener: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}
