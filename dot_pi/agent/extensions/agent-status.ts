/**
 * Agent Status Extension
 *
 * Reports pi's lifecycle to ~/bin/agent-status, which keys state by
 * $TMUX_PANE. The tmux agent-sessions picker (prefix+a, television channel)
 * groups sessions into needs-intervention / busy / done from that state.
 *
 * Pi has no built-in permission prompts, so there is no "needs intervention"
 * event to forward — sessions only ever report busy (agent loop running) and
 * done (waiting for input).
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const report = (...args: string[]) => {
	if (!process.env.TMUX_PANE) {
		return;
	}
	const child = spawn(join(homedir(), "bin", "agent-status"), args, {
		stdio: "ignore",
		detached: true,
	});
	child.unref();
};

export default function (pi: ExtensionAPI) {
	pi.on("input", () => report("update", "pi", "busy"));
	pi.on("agent_start", () => report("update", "pi", "busy"));
	pi.on("agent_end", () => report("update", "pi", "done"));
	pi.on("session_shutdown", () => report("clear"));
}
