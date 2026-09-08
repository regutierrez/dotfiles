import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const buildContinuationPrompt = (sessionFile: string | undefined, compactionEntryId: string): string => {
	const sessionSource =
		sessionFile === undefined
			? "No persisted session history is available."
			: [
					`If essential context is missing, read only the relevant messages in ${JSON.stringify(sessionFile)}.`,
					`Follow parentId links back from compaction entry ${JSON.stringify(compactionEntryId)}; ignore abandoned branches and encrypted checkpoint fields.`,
					"Use read or bash, not a nested Pi process.",
				].join(" ");

	return `Compaction completed. Use the context preserved in the summary or native checkpoint to continue the next unfinished step, respecting the latest user instructions. A native checkpoint is opaque; it has no readable summary. Do not repeat completed work or provide a recap unless needed. If the task is complete or needs user input, stop.

${sessionSource}`;
};

/**
 * Automatically resumes work after every successful Pi compaction.
 *
 * The continuation is deferred by one event-loop turn so manual compaction can
 * finish reconnecting the agent runtime before a new prompt begins. During an
 * active automatic-compaction recovery, it is delivered as steering so the
 * continuation is read before the retried agent performs more work.
 */
export default function continueAfterCompaction(pi: ExtensionAPI): void {
	const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

	pi.on("session_compact", (event, ctx) => {
		const sessionFile = ctx.sessionManager.getSessionFile();
		const prompt = buildContinuationPrompt(sessionFile, event.compactionEntry.id);

		const timer = setTimeout(() => {
			pendingTimers.delete(timer);
			pi.sendUserMessage(prompt, { deliverAs: "steer" });
		}, 0);

		pendingTimers.add(timer);
	});

	pi.on("session_shutdown", () => {
		for (const timer of pendingTimers) {
			clearTimeout(timer);
		}
		pendingTimers.clear();
	});
}
