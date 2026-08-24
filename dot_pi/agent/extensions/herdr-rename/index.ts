/** Mirror Pi's native session name into the Herdr Agents panel. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildHerdrPiSessionNameReportArgs,
	resolveHerdrRenamePaneEnv,
} from "./herdr-display-agent.ts";

const execFileAsync = promisify(execFile);
type HerdrSessionNameContext = Pick<ExtensionContext, "mode">;

export default function herdrSessionNameExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await syncHerdrPiSessionName(pi.getSessionName(), ctx);
	});

	pi.on("session_info_changed", async (event, ctx) => {
		await syncHerdrPiSessionName(event.name, ctx);
	});
}

/** Set `pi - <session name>`, or clear the override for an unnamed Pi session. */
async function syncHerdrPiSessionName(
	sessionName: string | undefined,
	ctx: HerdrSessionNameContext,
): Promise<void> {
	if (ctx.mode !== "tui") return;
	const pane = resolveHerdrRenamePaneEnv(process.env);
	if (!pane.ok) return;

	try {
		await execFileAsync(
			pane.herdrBin,
			buildHerdrPiSessionNameReportArgs({
				paneId: pane.paneId,
				sessionName,
			}),
			{ encoding: "utf8" },
		);
	} catch (error) {
		throw new Error(
			`herdr-session-name: pane report-metadata failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
