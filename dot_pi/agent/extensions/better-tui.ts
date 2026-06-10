import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "better-tui";

let currentCtx: ExtensionContext | undefined;
let tpsStreaming = false;
let tpsPhase: "idle" | "waiting" | "streaming" | "finished" = "idle";
let streamStart = 0;
let tpsTurnStart = 0;
let charsAccumulated = 0;
let lastTps = 0;
let totalTpsOutput = 0;
let totalStreamTime = 0;
let lastTtft = 0;
let lastOutputTokens = 0;
let lastStreamDuration = 0;
let ttftSamples: number[] = [];

function compactTps(tps: number): string {
  return `${tps.toFixed(0)}t/s`;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function saveTtft(): void {
  if (lastTtft <= 0 || lastTtft >= 120) return;
  ttftSamples.push(lastTtft);
  if (ttftSamples.length > 100) ttftSamples.shift();
}

function getTpsLabel(): string {
  if (tpsPhase === "waiting") {
    const recent = average(ttftSamples.slice(-5));
    return recent > 0 ? `waiting·last ${recent.toFixed(1)}s...` : "waiting...";
  }

  if (tpsPhase === "streaming" && lastTps > 0) {
    return `${compactTps(lastTps)}${lastTtft > 0 ? `, ${lastTtft.toFixed(1)}s` : ""}`;
  }

  if (tpsPhase === "finished" && lastTps > 0) {
    const ttft = lastTtft > 0 ? `, ${lastTtft.toFixed(1)}s` : "";
    const output = lastOutputTokens > 0 ? ` ↓${lastOutputTokens}` : "";
    const duration = lastStreamDuration > 0 ? ` (${lastStreamDuration.toFixed(1)}s)` : "";
    return `${compactTps(lastTps)}${ttft}${output}${duration}`;
  }

  if (totalStreamTime > 0 && totalTpsOutput > 0) {
    const avgTps = totalTpsOutput / totalStreamTime;
    const avgTtft = average(ttftSamples);
    return `${compactTps(avgTps)}${avgTtft > 0 ? `, ${avgTtft.toFixed(1)}s` : ""}`;
  }

  return "";
}

function updateStatus(): void {
  if (!currentCtx?.hasUI) return;
  const status = getTpsLabel();
  currentCtx.ui.setStatus(STATUS_KEY, status || undefined);
}

export default function betterTui(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    updateStatus();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    if (currentCtx === ctx) currentCtx = undefined;
  });

  pi.on("turn_start", async () => {
    tpsStreaming = false;
    tpsPhase = "waiting";
    streamStart = 0;
    charsAccumulated = 0;
    lastTps = 0;
    lastTtft = 0;
    lastOutputTokens = 0;
    lastStreamDuration = 0;
    tpsTurnStart = performance.now();
    updateStatus();
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;

    if (!tpsStreaming) {
      tpsStreaming = true;
      tpsPhase = "streaming";
      streamStart = performance.now();
      charsAccumulated = 0;
      lastTtft = (streamStart - tpsTurnStart) / 1000;
    }

    let chars = 0;
    for (const block of event.message.content) {
      if (block.type === "text") chars += block.text.length;
      else if (block.type === "thinking") chars += block.thinking.length;
    }
    charsAccumulated = chars;

    const elapsed = (performance.now() - streamStart) / 1000;
    if (elapsed > 0.1) lastTps = charsAccumulated / 4 / elapsed;
    updateStatus();
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const elapsed = streamStart > 0 ? (performance.now() - streamStart) / 1000 : 0;
    const outputTokens = event.message.usage?.output ?? 0;
    lastOutputTokens = outputTokens;
    lastStreamDuration = elapsed;

    if (elapsed > 0.1 && outputTokens > 0) {
      lastTps = outputTokens / elapsed;
      totalTpsOutput += outputTokens;
      totalStreamTime += elapsed;
    }

    tpsPhase = "finished";
    tpsStreaming = false;
    updateStatus();
  });

  pi.on("turn_end", async () => {
    saveTtft();
    if (!tpsStreaming) tpsPhase = "idle";
    updateStatus();
  });
}
