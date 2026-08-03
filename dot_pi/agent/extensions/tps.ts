/**
 * Append a TUI-only tok/s summary after each agent run.
 * Not sent to the LLM; ignored by /plannotator-last.
 *
 * Timing:
 * - TTFT prefers first content *_delta; falls back to content *_start.
 * - Gen window ends at last content *_delta when present (avoids message_end tail).
 * - Headline tok/s is token-weighted Σout / Σgen. When usage.reasoning > 0 the
 *   rate is marked approximate (~): output may include unstreamed reasoning.
 *
 * setTimeout(0): agent_end can fire before Pi finishes tearing down the last
 * streaming row. An earlier append can land above the final assistant text.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY = "tps-stats";

/** One assistant generation inside the agent run. */
type Sample = {
	output: number;
	/** Subset of output when the provider reports it. */
	reasoning: number;
	/** First content → last content delta (ms). Falls back to message_end. */
	genMs: number;
	/** message_start → first content (ms). 0 if unknown. */
	ttftMs: number;
};

/** Raw measurements; the renderer formats the lines. */
type TpsData = {
	samples: Sample[];
	/** agent_start → agent_end wall clock (ms). */
	wallMs: number;
};

/** Pre-aggregate shape still present in older session entries. */
type LegacyTpsData = {
	output: number;
	genMs: number;
};

function median(sorted: number[]): number {
	if (sorted.length === 0) return 0;
	const mid = sorted.length >> 1;
	if (sorted.length % 2 === 1) return sorted[mid]!;
	return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function fmtSec(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTps(tps: number): string {
	return tps >= 100 ? tps.toFixed(0) : tps.toFixed(1);
}

function isContentStart(type: string): boolean {
	return type.endsWith("_start") && type !== "start";
}

function isContentDelta(type: string): boolean {
	return type.endsWith("_delta");
}

function normalizeData(data: TpsData | LegacyTpsData | undefined): TpsData | undefined {
	if (!data) return undefined;
	if ("samples" in data && Array.isArray(data.samples)) {
		return {
			wallMs: data.wallMs,
			samples: data.samples.map((s) => ({
				output: s.output,
				reasoning: s.reasoning ?? 0,
				genMs: s.genMs,
				ttftMs: s.ttftMs,
			})),
		};
	}
	if ("output" in data && "genMs" in data && data.output > 0 && data.genMs > 0) {
		return {
			samples: [{ output: data.output, reasoning: 0, genMs: data.genMs, ttftMs: 0 }],
			wallMs: data.genMs,
		};
	}
	return undefined;
}

function formatSummary(raw: TpsData | LegacyTpsData | undefined, dim: (s: string) => string): string | undefined {
	const data = normalizeData(raw);
	if (!data) return undefined;

	const samples = data.samples.filter((s) => s.output > 0 && s.genMs > 0);
	if (samples.length === 0) return undefined;

	const output = samples.reduce((sum, s) => sum + s.output, 0);
	const reasoning = samples.reduce((sum, s) => sum + s.reasoning, 0);
	const genMs = samples.reduce((sum, s) => sum + s.genMs, 0);
	const overall = output / (genMs / 1000);
	const rates = samples.map((s) => s.output / (s.genMs / 1000)).sort((a, b) => a - b);
	const msgMean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
	const med = median(rates);
	const min = rates[0]!;
	const max = rates[rates.length - 1]!;
	const ttfts = samples.map((s) => s.ttftMs).filter((ms) => Number.isFinite(ms) && ms > 0);
	const avgTtft = ttfts.length > 0 ? ttfts.reduce((sum, ms) => sum + ms, 0) / ttfts.length : 0;
	const wallMs = data.wallMs > 0 ? data.wallMs : genMs;
	const genPct = wallMs > 0 ? Math.round((genMs / wallMs) * 100) : 0;

	// ~ when reasoning tokens may not align with the streamed gen window.
	const approx = reasoning > 0 ? "~" : "";
	const line1Bits = [`${approx}${fmtTps(overall)} tok/s`, `${output} out`];
	if (reasoning > 0) line1Bits.push(`${reasoning} reasoning`);
	const line1 = line1Bits.join(" · ");

	if (samples.length === 1) {
		const bits = [line1];
		if (avgTtft > 0) bits.push(`ttft ${fmtSec(avgTtft)}`);
		if (wallMs > genMs + 50) bits.push(`wall ${fmtSec(wallMs)}`);
		return dim(bits.join(" · "));
	}

	// Multi-call: unweighted per-call distribution + time split (gen vs tools/wait).
	const line2 = [
		`msg mean ${fmtTps(msgMean)}`,
		`med ${fmtTps(med)}`,
		`min ${fmtTps(min)}`,
		`max ${fmtTps(max)}`,
		`${samples.length} calls`,
		`gen ${fmtSec(genMs)}`,
		`wall ${fmtSec(wallMs)}`,
		`gen ${genPct}%`,
		avgTtft > 0 ? `ttft ${fmtSec(avgTtft)}` : "",
	]
		.filter(Boolean)
		.join(" · ");

	return dim(`${line1}\n${line2}`);
}

export default function (pi: ExtensionAPI) {
	let wallStartedAt = 0;
	let msgStartedAt = 0;
	/** First content-block *_start (fallback if no deltas). */
	let firstStartAt = 0;
	/** First content *_delta (preferred TTFT / gen start). */
	let firstDeltaAt = 0;
	/** Last content *_delta (preferred gen end). */
	let lastDeltaAt = 0;
	const samples: Sample[] = [];

	const resetMessageClock = () => {
		msgStartedAt = 0;
		firstStartAt = 0;
		firstDeltaAt = 0;
		lastDeltaAt = 0;
	};

	pi.registerEntryRenderer<TpsData | LegacyTpsData>(ENTRY, (entry, _opts, theme) => {
		const text = formatSummary(entry.data, (s) => theme.fg("dim", s));
		if (!text) return undefined;
		return new Text(text, 0, 0);
	});

	pi.on("agent_start", () => {
		wallStartedAt = performance.now();
		samples.length = 0;
		resetMessageClock();
	});

	pi.on("message_start", (event) => {
		if (event.message.role !== "assistant") return;
		msgStartedAt = performance.now();
		firstStartAt = 0;
		firstDeltaAt = 0;
		lastDeltaAt = 0;
	});

	pi.on("message_update", (event) => {
		if (event.message.role !== "assistant") return;
		const type = event.assistantMessageEvent.type;
		const now = performance.now();

		if (isContentDelta(type)) {
			const delta = (event.assistantMessageEvent as { delta?: unknown }).delta;
			// Ignore empty deltas so TTFT/last-token stay on real content.
			if (typeof delta === "string" && delta.length === 0) return;
			if (!firstDeltaAt) firstDeltaAt = now;
			lastDeltaAt = now;
			return;
		}

		if (isContentStart(type) && !firstStartAt) {
			firstStartAt = now;
		}
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant" || !msgStartedAt) return;

		const msg = event.message as AssistantMessage;
		const output = msg.usage?.output ?? 0;
		const reasoning = typeof msg.usage?.reasoning === "number" && msg.usage.reasoning > 0 ? msg.usage.reasoning : 0;

		// Prefer first real token delta; fall back to block start, then message_start.
		const firstContentAt = firstDeltaAt || firstStartAt;
		const genStart = firstContentAt || msgStartedAt;
		const ttftMs = firstContentAt ? firstContentAt - msgStartedAt : 0;
		// Prefer last delta so final usage/stop/handler lag is not counted as gen.
		const genEnd = lastDeltaAt > genStart ? lastDeltaAt : performance.now();
		const genMs = genEnd - genStart;

		resetMessageClock();

		if (output <= 0 || genMs <= 0) return;
		if (msg.stopReason === "error" || msg.stopReason === "aborted") return;

		samples.push({ output, reasoning, genMs, ttftMs });
	});

	pi.on("agent_end", () => {
		if (samples.length === 0 || !wallStartedAt) return;

		const data: TpsData = {
			samples: samples.slice(),
			wallMs: performance.now() - wallStartedAt,
		};
		wallStartedAt = 0;
		samples.length = 0;

		setTimeout(() => pi.appendEntry<TpsData>(ENTRY, data), 0);
	});
}
