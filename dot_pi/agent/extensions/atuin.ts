/**
 * Atuin extension for pi.
 *
 * Tracks bash commands executed by pi in Atuin history with author `pi`.
 * Uses pi lifecycle events instead of replacing the bash tool, so it can
 * coexist with extensions like uv.ts that wrap bash execution.
 */

import type {
	BashOperations,
	ExtensionAPI,
	ExtensionContext,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	UserBashEvent,
} from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

const ATUIN_AUTHOR = "pi";
const ATUIN_TIMEOUT_MS = 10_000;

type PendingHistory = {
	cwd: string;
	historyId: string;
};

const pendingHistories = new Map<string, PendingHistory>();

async function startHistory(
	pi: ExtensionAPI,
	cwd: string,
	command: string,
): Promise<string | undefined> {
	try {
		const result = await pi.exec(
			"atuin",
			["history", "start", "--author", ATUIN_AUTHOR, "--", command],
			{ cwd, timeout: ATUIN_TIMEOUT_MS },
		);

		if (result.code !== 0) return undefined;

		const id = result.stdout.trim();
		return id.length > 0 ? id : undefined;
	} catch {
		return undefined;
	}
}

async function endHistory(
	pi: ExtensionAPI,
	cwd: string,
	historyId: string,
	exitCode: number,
): Promise<void> {
	try {
		await pi.exec(
			"atuin",
			["history", "end", historyId, "--exit", String(exitCode)],
			{ cwd, timeout: ATUIN_TIMEOUT_MS },
		);
	} catch {
		// Ignore Atuin failures so command execution is never blocked.
	}
}

function extractBashCommand(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const command = (args as { command?: unknown }).command;
	return typeof command === "string" ? command : undefined;
}

function extractResultText(result: unknown): string {
	if (!result || typeof result !== "object") return "";
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return "";

	return content
		.filter(
			(item): item is { type: string; text?: string } =>
				item !== null && typeof item === "object" && "type" in item,
		)
		.filter((item) => item.type === "text")
		.map((item) => item.text ?? "")
		.join("\n");
}

function extractExitCode(result: unknown, isError: boolean): number {
	if (!isError) return 0;

	const text = extractResultText(result);
	const exitMatch = text.match(/Command exited with code (\d+)/);
	if (exitMatch) return Number.parseInt(exitMatch[1], 10);
	if (text.includes("Command aborted")) return 130;

	return 1;
}

function createTrackedOperations(pi: ExtensionAPI, base: BashOperations): BashOperations {
	return {
		async exec(command, cwd, options) {
			const historyId = await startHistory(pi, cwd, command);
			let exitCode: number | null = null;

			try {
				const result = await base.exec(command, cwd, options);
				exitCode = result.exitCode;
				return result;
			} finally {
				if (historyId) {
					await endHistory(
						pi,
						cwd,
						historyId,
						exitCode ?? (options.signal?.aborted ? 130 : 1),
					);
				}
			}
		},
	};
}

export default function atuinPiExtension(pi: ExtensionAPI) {
	const trackedOperations = createTrackedOperations(pi, createLocalBashOperations());

	pi.on("user_bash", (_event: UserBashEvent) => ({
		operations: trackedOperations,
	}));

	pi.on("tool_execution_start", async (event: ToolExecutionStartEvent, ctx: ExtensionContext) => {
		if (event.toolName !== "bash") return;

		const command = extractBashCommand(event.args);
		if (!command) return;

		const historyId = await startHistory(pi, ctx.cwd, command);
		if (historyId) {
			pendingHistories.set(event.toolCallId, { cwd: ctx.cwd, historyId });
		}
	});

	pi.on("tool_execution_end", async (event: ToolExecutionEndEvent) => {
		if (event.toolName !== "bash") return;

		const pending = pendingHistories.get(event.toolCallId);
		pendingHistories.delete(event.toolCallId);
		if (!pending) return;

		await endHistory(
			pi,
			pending.cwd,
			pending.historyId,
			extractExitCode(event.result, event.isError),
		);
	});
}
