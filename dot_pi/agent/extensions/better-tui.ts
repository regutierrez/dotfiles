import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * TPS meter adapted from https://github.com/vskrch/pi-tps-meter (MIT).
 * Kept in better-tui so the footer status comes from the local extension.
 */

const STATUS_KEY = "better-tui";

const WINDOW_SIZE = 60;
const WINDOW_MS = 60_000;
const STREAM_INTERVAL_MS = 200;
const SPARK_LEN = 12;
const ALLTIME_CAP = 500;
const FAST_TPS = 50;
const MED_TPS = 20;

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const HBLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const GAUGE_LEN = 11;
const GAUGE_FLOOR = 40;
const TRACK = "·";
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type Theme = ExtensionContext["ui"]["theme"];

let streamStartMs = 0;
let firstTokenMs = 0;
let lastTokenMs = 0;
let streamChars = 0;
let streamTokens = 0;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let streaming = false;
let spinIndex = 0;

const WINDOW_STRIDE = 3;
const windowBuffer = new Float64Array(WINDOW_SIZE * WINDOW_STRIDE);
let windowLength = 0;
let windowHead = 0;

const LIVE_LEN = 25;
const liveTimes = new Float64Array(LIVE_LEN);
const liveTokens = new Float64Array(LIVE_LEN);
let liveLength = 0;
let liveHead = 0;

const allTimeBuffer = new Float64Array(ALLTIME_CAP);
let allTimeLength = 0;
let allTimeHead = 0;
let allTimeSum = 0;

const sparkBuffer = new Float64Array(SPARK_LEN);
let sparkLength = 0;
let sparkHead = 0;
let sparkMax = 1;
let sparkCache = "";
let sparkDirty = true;
let sparkTheme: Theme | undefined;

function now(): number {
  return Date.now();
}

function estimateTokens(charCount: number): number {
  return (charCount >>> 2) + ((charCount & 3) > 0 ? 1 : 0);
}

function pushWindowSample(tokens: number, elapsedSec: number, ms: number): void {
  const base = windowHead * WINDOW_STRIDE;
  windowBuffer[base] = tokens;
  windowBuffer[base + 1] = elapsedSec;
  windowBuffer[base + 2] = ms;
  windowHead = (windowHead + 1) % WINDOW_SIZE;
  if (windowLength < WINDOW_SIZE) windowLength++;
}

function pushLiveSample(ms: number, tokens: number): void {
  liveTimes[liveHead] = ms;
  liveTokens[liveHead] = tokens;
  liveHead = (liveHead + 1) % LIVE_LEN;
  if (liveLength < LIVE_LEN) liveLength++;
}

function resetLiveSamples(): void {
  liveLength = 0;
  liveHead = 0;
}

function liveWindowTps(): number | undefined {
  if (liveLength < 2) return undefined;
  const newest = (liveHead - 1 + LIVE_LEN) % LIVE_LEN;
  const oldest = liveLength < LIVE_LEN ? 0 : liveHead;
  const dt = ((liveTimes[newest] ?? 0) - (liveTimes[oldest] ?? 0)) / 1000;
  if (dt < 0.3) return undefined;
  return Math.max(0, ((liveTokens[newest] ?? 0) - (liveTokens[oldest] ?? 0)) / dt);
}

function pushAllTimeSample(tps: number): void {
  allTimeSum += tps;
  if (allTimeLength >= ALLTIME_CAP) allTimeSum -= allTimeBuffer[allTimeHead] ?? 0;
  allTimeBuffer[allTimeHead] = tps;
  allTimeHead = (allTimeHead + 1) % ALLTIME_CAP;
  if (allTimeLength < ALLTIME_CAP) allTimeLength++;
}

function pushSparkSample(tps: number): void {
  sparkBuffer[sparkHead] = tps;
  sparkHead = (sparkHead + 1) % SPARK_LEN;
  if (sparkLength < SPARK_LEN) sparkLength++;
  if (tps > sparkMax) sparkMax = tps;
  if (sparkMax > 10) sparkMax *= 0.99;
  sparkDirty = true;
}

// Token-weighted so short replies don't skew the average as much as long ones.
function windowAverage(): number {
  if (windowLength === 0) return 0;

  const cutoff = now() - WINDOW_MS;
  const oldest = windowLength < WINDOW_SIZE ? 0 : windowHead;
  let tokenSum = 0;
  let elapsedSum = 0;

  for (let i = 0; i < windowLength; i++) {
    const index = (oldest + i) % WINDOW_SIZE;
    const base = index * WINDOW_STRIDE;
    const sampleTime = windowBuffer[base + 2] ?? 0;
    if (sampleTime < cutoff) continue;
    tokenSum += windowBuffer[base] ?? 0;
    elapsedSum += windowBuffer[base + 1] ?? 0;
  }

  return elapsedSum < 1e-6 ? 0 : tokenSum / elapsedSum;
}

function allTimeMean(): number {
  return allTimeLength === 0 ? 0 : allTimeSum / allTimeLength;
}

function allTimeP95(): number {
  if (allTimeLength === 0) return 0;

  const samples = new Float64Array(allTimeLength);
  const oldest = allTimeLength < ALLTIME_CAP ? 0 : allTimeHead;
  for (let i = 0; i < allTimeLength; i++) samples[i] = allTimeBuffer[(oldest + i) % ALLTIME_CAP] ?? 0;

  for (let i = 1; i < samples.length; i++) {
    const value = samples[i] ?? 0;
    let j = i - 1;
    while (j >= 0 && (samples[j] ?? 0) > value) {
      samples[j + 1] = samples[j] ?? 0;
      j--;
    }
    samples[j + 1] = value;
  }

  return samples[Math.ceil(samples.length * 0.95) - 1] ?? 0;
}

function formatTps(value: number): string {
  if (value < 10) return value.toFixed(1);
  if (value < 100) return value.toFixed(0);
  return `${Math.round(value)}`;
}

function speedColor(tps: number, text: string, theme: Theme): string {
  if (tps >= FAST_TPS) return theme.fg("success", text);
  if (tps >= MED_TPS) return theme.fg("warning", text);
  return theme.fg("error", text);
}

function renderSparkline(theme: Theme): string {
  if (theme !== sparkTheme) {
    sparkDirty = true;
    sparkTheme = theme;
  }
  if (!sparkDirty) return sparkCache;

  if (sparkLength === 0) {
    sparkCache = theme.fg("dim", "▁".repeat(SPARK_LEN));
    sparkDirty = false;
    return sparkCache;
  }

  const values = new Float64Array(SPARK_LEN);
  const oldest = sparkLength < SPARK_LEN ? 0 : sparkHead;
  for (let i = 0; i < sparkLength; i++) values[i] = sparkBuffer[(oldest + i) % SPARK_LEN] ?? 0;

  let min = Infinity;
  let max = 0;
  for (let i = 0; i < sparkLength; i++) {
    const value = values[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min;
  const padding = SPARK_LEN - sparkLength;
  let result = padding > 0 ? theme.fg("dim", TRACK.repeat(padding)) : "";

  for (let i = 0; i < sparkLength; i++) {
    const value = values[i] ?? 0;
    const level =
      range < 1e-6 ? (max > 0 ? 4 : 0) : Math.min(7, Math.max(0, Math.round(((value - min) / range) * 7)));
    result += speedColor(value, BLOCKS[level] ?? BLOCKS[0]!, theme);
  }

  sparkCache = result;
  sparkDirty = false;
  return result;
}

function renderGauge(tps: number, theme: Theme): string {
  const scale = Math.max(sparkMax, GAUGE_FLOOR);
  const fraction = Math.min(1, Math.max(0, scale > 0 ? tps / scale : 0));
  const eighths = Math.round(fraction * GAUGE_LEN * 8);
  const fullCells = Math.floor(eighths / 8);
  const remainder = eighths % 8;

  let fill = "█".repeat(fullCells);
  let usedCells = fullCells;
  if (fullCells < GAUGE_LEN && remainder > 0) {
    fill += HBLOCKS[remainder] ?? "";
    usedCells++;
  }

  const track = TRACK.repeat(GAUGE_LEN - usedCells);
  return theme.fg("dim", "▕") + speedColor(tps, fill, theme) + theme.fg("dim", `${track}▏`);
}

function renderSpin(): string {
  const value = SPIN[spinIndex] ?? SPIN[0]!;
  spinIndex = (spinIndex + 1) % SPIN.length;
  return value;
}

function renderLive(theme: Theme): string {
  const nowMs = now();
  const tokens = streamTokens;
  pushLiveSample(nowMs, tokens);

  let tps = liveWindowTps();
  if (tps === undefined) {
    const referenceMs = firstTokenMs > 0 ? firstTokenMs : streamStartMs;
    const elapsed = (nowMs - referenceMs) / 1000;
    tps = elapsed > 0.3 ? tokens / elapsed : 0;
  }

  return `${theme.fg("accent", renderSpin())} ${renderGauge(tps, theme)} ${speedColor(tps, formatTps(tps), theme)} ${theme.fg("dim", "tps")}`;
}

function renderFinal(theme: Theme): string {
  const average = windowAverage();
  const mean = allTimeMean();
  const p95 = allTimeP95();
  if (average === 0 && mean === 0) return "";

  const separator = theme.fg("dim", "·");
  const meanLabel = `${theme.fg("dim", "μ")} ${speedColor(mean, formatTps(mean), theme)}`;
  const p95Label = `${theme.fg("dim", "p95")} ${speedColor(p95, formatTps(p95), theme)}`;
  return `${renderSparkline(theme)} ${speedColor(average, formatTps(average), theme)} ${theme.fg("dim", "tps")} ${separator} ${meanLabel} ${separator} ${p95Label}`;
}

function startTick(ctx: ExtensionContext): void {
  if (tickTimer !== undefined) return;
  tickTimer = setInterval(() => {
    if (!streaming) {
      stopTick();
      return;
    }
    ctx.ui.setStatus(STATUS_KEY, renderLive(ctx.ui.theme));
  }, STREAM_INTERVAL_MS);
}

function stopTick(): void {
  if (tickTimer === undefined) return;
  clearInterval(tickTimer);
  tickTimer = undefined;
}

function resetSessionState(): void {
  streaming = false;
  stopTick();
  streamStartMs = 0;
  firstTokenMs = 0;
  lastTokenMs = 0;
  streamChars = 0;
  streamTokens = 0;
  spinIndex = 0;
  windowLength = 0;
  windowHead = 0;
  resetLiveSamples();
  allTimeLength = 0;
  allTimeHead = 0;
  allTimeSum = 0;
  sparkLength = 0;
  sparkHead = 0;
  sparkMax = 1;
  sparkCache = "";
  sparkDirty = true;
  sparkTheme = undefined;
}

export default function betterTui(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    resetSessionState();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    streamStartMs = now();
    firstTokenMs = 0;
    lastTokenMs = 0;
    streamChars = 0;
    streamTokens = 0;
    streaming = true;
    spinIndex = 0;
    resetLiveSamples();
    startTick(ctx);
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;

    const assistantEvent = event.assistantMessageEvent;
    if (
      assistantEvent.type !== "text_delta" &&
      assistantEvent.type !== "thinking_delta" &&
      assistantEvent.type !== "toolcall_delta"
    )
      return;
    if (!assistantEvent.delta) return;

    lastTokenMs = now();
    if (firstTokenMs === 0) firstTokenMs = lastTokenMs;
    streamChars += assistantEvent.delta.length;
    streamTokens = estimateTokens(streamChars);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    streaming = false;
    stopTick();

    // Streamed estimate over the streamed window: usage.output is deliberately
    // ignored because it counts hidden reasoning tokens generated before the
    // first delta, which inflates the rate.
    const tokens = streamTokens;

    // Measure to the last streamed delta, not this handler, which can fire late.
    const endMs = lastTokenMs > 0 ? lastTokenMs : now();
    const referenceMs = firstTokenMs > 0 ? firstTokenMs : streamStartMs;
    const elapsed = (endMs - referenceMs) / 1000;
    if (elapsed < 0.1 || tokens === 0) return;

    const tps = tokens / elapsed;
    pushWindowSample(tokens, elapsed, now());
    pushAllTimeSample(tps);
    pushSparkSample(tps);

    const status = renderFinal(ctx.ui.theme);
    if (status) ctx.ui.setStatus(STATUS_KEY, status);
  });

  pi.on("agent_end", async () => {
    streaming = false;
    stopTick();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    streaming = false;
    stopTick();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
