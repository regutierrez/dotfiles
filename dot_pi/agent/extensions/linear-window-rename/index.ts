/**
 * On the first user prompt, prepend `(TRI-1234)` to the Herdr window (tab) name
 * when that prompt contains a Linear issue id or linear.app URL. Work profile only.
 * The space-local window number stays in front. No-op outside Herdr.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildLinearWindowLabel,
	buildLinearWindowListArgs,
	buildLinearWindowRenameArgs,
	extractLinearIssueId,
	localWindowNumberInSpace,
	parseHerdrTabList,
	resolveHerdrWindowEnv,
	shouldRenameLinearWindow,
	type HerdrWindowEnv,
} from "./linear-window-label.ts";

const execFileAsync = promisify(execFile);

export default function linearWindowRenameExtension(pi: ExtensionAPI): void {
	let sawStartingPrompt = false;

	pi.on("session_start", () => {
		sawStartingPrompt = false;
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (sawStartingPrompt) return;
		sawStartingPrompt = true;
		if (ctx.mode !== "tui") return;
		const prompt = event.prompt?.trim();
		if (!prompt) return;
		const linearIssueId = extractLinearIssueId(prompt);
		if (!linearIssueId) return;
		const env = resolveHerdrWindowEnv(process.env);
		if (env.ok === false) return;
		void renameLinearWindow({ env, linearIssueId }).catch(() => {});
	});
}

async function renameLinearWindow(options: {
	env: Extract<HerdrWindowEnv, { ok: true }>;
	linearIssueId: string;
}): Promise<void> {
	const { stdout } = await execFileAsync(
		options.env.herdrBin,
		buildLinearWindowListArgs(options.env.workspaceId),
		{ encoding: "utf8" },
	);
	let payload: unknown;
	try {
		payload = JSON.parse(stdout);
	} catch {
		return;
	}
	const tabs = parseHerdrTabList(payload);
	const windowNumber = localWindowNumberInSpace(tabs, options.env.tabId);
	if (windowNumber === undefined) return;
	const current = tabs.find((tab) => tab.tabId === options.env.tabId);
	if (!shouldRenameLinearWindow(current?.label, windowNumber, options.linearIssueId)) return;
	const label = buildLinearWindowLabel(windowNumber, current?.label, options.linearIssueId);
	await execFileAsync(options.env.herdrBin, buildLinearWindowRenameArgs(options.env.tabId, label), {
		encoding: "utf8",
	});
}
