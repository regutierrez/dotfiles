/**
 * Append a TUI-only gen tok/s line after each assistant reply.
 * Not sent to the LLM; ignored by /plannotator-last.
 *
 * setTimeout(0): message_end runs before Pi persists the message and tears
 * down the streaming row. An earlier append lands above the assistant text.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY = "tps-stats";

/** Raw stream measurements; the renderer formats the line. */
type TpsData = {
	output: number;
	genMs: number;
};

export default function (pi: ExtensionAPI) {
	let startedAt = 0;
	let firstTokenAt = 0;

	pi.registerEntryRenderer<TpsData>(ENTRY, (entry, _opts, theme) => {
		const data = entry.data;
		if (!data || data.output <= 0 || data.genMs <= 0) return undefined;
		const tps = data.output / (data.genMs / 1000);
		return new Text(theme.fg("dim", `${tps.toFixed(1)} tok/s · ${data.output} out`), 0, 0);
	});

	pi.on("message_start", (event) => {
		if (event.message.role !== "assistant") return;
		startedAt = performance.now();
		firstTokenAt = 0;
	});

	pi.on("message_update", (event) => {
		if (firstTokenAt || event.message.role !== "assistant") return;
		const type = event.assistantMessageEvent.type;
		if (type.endsWith("_delta") || (type.endsWith("_start") && type !== "start")) {
			firstTokenAt = performance.now();
		}
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant" || !startedAt) return;

		const msg = event.message as AssistantMessage;
		const output = msg.usage?.output ?? 0;
		const genStart = firstTokenAt || startedAt;
		startedAt = 0;
		firstTokenAt = 0;

		if (output <= 0 || msg.stopReason === "error" || msg.stopReason === "aborted") return;

		const data: TpsData = { output, genMs: performance.now() - genStart };
		setTimeout(() => pi.appendEntry<TpsData>(ENTRY, data), 0);
	});
}
