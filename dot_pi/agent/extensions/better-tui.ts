import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { Editor, TUI, type Component, type EditorTheme } from "@earendil-works/pi-tui";

export type ViewportMode = "follow" | "detached";

export interface ViewportPosition {
  mode: ViewportMode;
  scrollTop: number;
  transcriptHeight: number;
  transcriptLineCount: number;
}

export interface ViewportState {
  installed: boolean;
  editorInstalled: boolean;
  mode: ViewportMode;
  scrollTop: number;
  lastTranscriptHeight: number;
  lastTranscriptLineCount: number;
  lastTermWidth: number;
  originalRender?: TUI["render"];
  requestRender?: () => void;
  tui?: TUI;
  notifyWarning?: (message: string) => void;
  notifyPosition?: (position: ViewportPosition | null) => void;
  lastPositionKey?: string;
  lastWarning?: string;
}

export interface LayoutSections {
  transcript: Component[];
  dock: Component[];
}

export interface ComposeViewportLinesParams {
  state: ViewportState;
  transcriptLines: string[];
  dockLines: string[];
  termRows: number;
  termWidth: number;
}

const EXPECTED_TOP_LEVEL_CHILD_COUNT = 8;
const TRANSCRIPT_CHILD_COUNT = 2;
const WARNING_PREFIX = "Better TUI viewport disabled:";
const STATUS_KEY = "better-tui";

let currentCtx: ExtensionContext | undefined;
let viewportPosition: ViewportPosition | null = null;
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

// Local CustomEditor compatibility shim. Pi exports CustomEditor, but this
// extension is loaded through jiti in a way that can still trip over the
// package root's ESM-only export path in some installs.
export class CompatCustomEditor extends Editor {
  readonly actionHandlers = new Map<string, () => void>();
  onEscape?: () => void;
  onCtrlD?: () => void;
  onPasteImage?: () => void;
  onExtensionShortcut?: (data: string) => boolean;

  constructor(tui: TUI, theme: EditorTheme, private readonly keybindings: KeybindingsManager) {
    super(tui, theme);
  }

  onAction(action: string, handler: () => void): void {
    this.actionHandlers.set(action, handler);
  }

  override handleInput(data: string): void {
    if (this.onExtensionShortcut?.(data)) return;

    if (this.keybindings.matches(data, "app.clipboard.pasteImage" as never)) {
      this.onPasteImage?.();
      return;
    }

    if (this.keybindings.matches(data, "app.interrupt" as never)) {
      if (!this.isShowingAutocomplete()) {
        const handler = this.onEscape ?? this.actionHandlers.get("app.interrupt");
        if (handler) {
          handler();
          return;
        }
      }
      super.handleInput(data);
      return;
    }

    if (this.keybindings.matches(data, "app.exit" as never) && this.getText().length === 0) {
      const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
      handler?.();
      return;
    }

    for (const [action, handler] of this.actionHandlers) {
      if (action === "app.interrupt" || action === "app.exit") continue;
      if (this.keybindings.matches(data, action as never)) {
        handler();
        return;
      }
    }

    super.handleInput(data);
  }
}

export function createViewportState(): ViewportState {
  return {
    installed: false,
    editorInstalled: false,
    mode: "follow",
    scrollTop: 0,
    lastTranscriptHeight: 0,
    lastTranscriptLineCount: 0,
    lastTermWidth: 0,
  };
}

export function isTmuxSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TMUX);
}

export function partitionLayoutChildren(children: Component[]): LayoutSections | null {
  if (children.length !== EXPECTED_TOP_LEVEL_CHILD_COUNT) return null;
  return {
    transcript: children.slice(0, TRANSCRIPT_CHILD_COUNT),
    dock: children.slice(TRANSCRIPT_CHILD_COUNT),
  };
}

export function renderComponents(children: Component[], width: number): string[] {
  const lines: string[] = [];
  for (const child of children) lines.push(...child.render(width));
  return lines;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeMaxScrollTop(transcriptLineCount: number, transcriptHeight: number): number {
  return Math.max(0, transcriptLineCount - Math.max(0, transcriptHeight));
}

export function resetViewportToFollow(state: ViewportState): void {
  state.mode = "follow";
  state.scrollTop = 0;
  publishViewportPosition(state);
}

function getViewportPosition(state: ViewportState): ViewportPosition | null {
  if (state.mode !== "detached") return null;
  if (state.lastTranscriptHeight <= 0 || state.lastTranscriptLineCount <= state.lastTranscriptHeight) return null;
  return {
    mode: state.mode,
    scrollTop: state.scrollTop,
    transcriptHeight: state.lastTranscriptHeight,
    transcriptLineCount: state.lastTranscriptLineCount,
  };
}

function publishViewportPosition(state: ViewportState): void {
  const position = getViewportPosition(state);
  const key = position
    ? `${position.mode}:${position.scrollTop}:${position.transcriptHeight}:${position.transcriptLineCount}`
    : "follow";
  if (state.lastPositionKey === key) return;
  state.lastPositionKey = key;
  state.notifyPosition?.(position);
}

export function composeViewportLines({
  state,
  transcriptLines,
  dockLines,
  termRows,
  termWidth,
}: ComposeViewportLinesParams): string[] {
  if (state.lastTermWidth > 0 && state.lastTermWidth !== termWidth) {
    resetViewportToFollow(state);
  }
  state.lastTermWidth = termWidth;

  const transcriptHeight = Math.max(0, termRows - dockLines.length);
  state.lastTranscriptHeight = transcriptHeight;
  state.lastTranscriptLineCount = transcriptLines.length;

  const maxScrollTop = computeMaxScrollTop(transcriptLines.length, transcriptHeight);
  state.scrollTop = state.mode === "follow" ? maxScrollTop : clamp(state.scrollTop, 0, maxScrollTop);
  publishViewportPosition(state);

  if (transcriptHeight <= 0) {
    return dockLines.length > termRows ? dockLines.slice(-termRows) : dockLines;
  }

  const visibleTranscript = transcriptLines.slice(state.scrollTop, state.scrollTop + transcriptHeight);
  while (visibleTranscript.length < transcriptHeight) visibleTranscript.push("");
  return [...visibleTranscript, ...dockLines];
}

export function scrollViewportBy(state: ViewportState, deltaLines: number): boolean {
  const transcriptHeight = Math.max(0, state.lastTranscriptHeight);
  const maxScrollTop = computeMaxScrollTop(state.lastTranscriptLineCount, transcriptHeight);
  const currentTop = state.mode === "follow" ? maxScrollTop : clamp(state.scrollTop, 0, maxScrollTop);
  let nextMode = state.mode;
  let nextTop = clamp(currentTop + deltaLines, 0, maxScrollTop);

  if (deltaLines < 0 && maxScrollTop > 0) nextMode = "detached";
  if (deltaLines > 0 && nextTop >= maxScrollTop) {
    nextMode = "follow";
    nextTop = maxScrollTop;
  }

  const changed = nextMode !== state.mode || nextTop !== state.scrollTop;
  state.mode = nextMode;
  state.scrollTop = nextTop;

  if (changed) {
    publishViewportPosition(state);
    state.requestRender?.();
  }
  return changed;
}

function warnOnce(state: ViewportState, reason: string): void {
  const message = `${WARNING_PREFIX} ${reason}`;
  if (state.lastWarning === message) return;
  state.lastWarning = message;
  queueMicrotask(() => state.notifyWarning?.(message));
}

function fallbackRender(tui: TUI, state: ViewportState, width: number): string[] {
  return state.originalRender ? state.originalRender.call(tui, width) : renderComponents(tui.children as Component[], width);
}

function disableViewportRuntime(state: ViewportState, reason: string): void {
  const tui = state.tui;
  const requestRender = state.requestRender;
  if (tui) restoreRenderShim(tui, state);

  state.installed = false;
  state.requestRender = undefined;
  state.tui = undefined;
  state.lastPositionKey = undefined;
  resetViewportToFollow(state);
  warnOnce(state, reason);
  queueMicrotask(() => requestRender?.());
}

function renderViewportRoot(tui: TUI, width: number, state: ViewportState): string[] {
  const sections = partitionLayoutChildren(tui.children as Component[]);
  if (!sections) {
    disableViewportRuntime(state, "unsupported Pi layout");
    return fallbackRender(tui, state, width);
  }

  const dockLines = renderComponents(sections.dock, width);
  const transcriptLines = renderComponents(sections.transcript, width);
  return composeViewportLines({
    state,
    transcriptLines,
    dockLines,
    termRows: tui.terminal.rows,
    termWidth: width,
  });
}

export function installRenderShim(tui: TUI, state: ViewportState): boolean {
  if (state.installed && state.tui === tui) return true;
  if (state.installed && state.tui && state.tui !== tui) {
    disableViewportRuntime(state, "session restarted before cleanup completed");
  }

  if (tui.render !== TUI.prototype.render) {
    warnOnce(state, "another extension already patched TUI.render");
    return false;
  }
  if (!partitionLayoutChildren(tui.children as Component[])) {
    warnOnce(state, "unsupported Pi layout");
    return false;
  }

  state.originalRender = tui.render;
  state.tui = tui;
  state.requestRender = () => tui.requestRender();
  state.installed = true;
  state.lastWarning = undefined;
  tui.render = ((width: number) => renderViewportRoot(tui, width, state)) as TUI["render"];
  return true;
}

export function restoreRenderShim(tui: TUI, state: ViewportState): void {
  if (!state.originalRender) return;
  tui.render = state.originalRender;
  state.originalRender = undefined;
}

export class ViewportEditor extends CompatCustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    private readonly viewportKeybindings: KeybindingsManager,
    private readonly viewportState: ViewportState,
  ) {
    super(tui, theme, viewportKeybindings);
  }

  override handleInput(data: string): void {
    const interceptViewportKey = (direction: -1 | 1): boolean => {
      if (!this.viewportState.installed || this.isShowingAutocomplete()) return false;
      const pageSize = Math.max(1, Math.floor((this.viewportState.lastTranscriptHeight || 1) * 0.75));
      scrollViewportBy(this.viewportState, direction * pageSize);
      return true;
    };

    if (this.viewportKeybindings.matches(data, "tui.editor.pageUp") && interceptViewportKey(-1)) return;
    if (this.viewportKeybindings.matches(data, "tui.editor.pageDown") && interceptViewportKey(1)) return;
    super.handleInput(data);
  }
}

function teardownViewport(ctx: ExtensionContext | undefined, state: ViewportState, restoreEditor: boolean): void {
  if (state.tui) restoreRenderShim(state.tui, state);

  state.installed = false;
  state.tui = undefined;
  state.requestRender = undefined;
  state.lastPositionKey = undefined;
  resetViewportToFollow(state);

  if (restoreEditor && state.editorInstalled && ctx?.hasUI) ctx.ui.setEditorComponent(undefined);
  state.editorInstalled = false;
}

function installViewportEditor(ctx: ExtensionContext, state: ViewportState): void {
  state.notifyWarning = (message: string) => ctx.ui.notify(message, "warning");
  state.notifyPosition = (position) => {
    viewportPosition = position;
    updateStatus();
  };
  state.lastWarning = undefined;
  state.editorInstalled = true;

  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const installed = installRenderShim(tui, state);
    tui.requestRender();
    return installed ? new ViewportEditor(tui, theme, keybindings, state) : new CompatCustomEditor(tui, theme, keybindings);
  });
}

function installViewportShim(pi: ExtensionAPI): void {
  const state = createViewportState();

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    viewportPosition = null;
    teardownViewport(ctx, state, true);
    if (ctx.hasUI && isTmuxSession()) installViewportEditor(ctx, state);
    updateStatus();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    teardownViewport(ctx, state, true);
    ctx.ui.setStatus(STATUS_KEY, undefined);
    if (currentCtx === ctx) currentCtx = undefined;
  });
}

function formatViewportLabel(position: ViewportPosition | null): string {
  if (!position || position.mode !== "detached") return "";
  const maxScrollTop = Math.max(0, position.transcriptLineCount - Math.max(0, position.transcriptHeight));
  const percent = maxScrollTop > 0 ? Math.round((position.scrollTop / maxScrollTop) * 100) : 100;
  const firstLine = Math.min(position.transcriptLineCount, position.scrollTop + 1);
  const lastLine = Math.min(position.transcriptLineCount, position.scrollTop + position.transcriptHeight);
  return `view:${percent}% ${firstLine}-${lastLine}/${position.transcriptLineCount}`;
}

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
  const status = [formatViewportLabel(viewportPosition), getTpsLabel()].filter(Boolean).join(" · ");
  currentCtx.ui.setStatus(STATUS_KEY, status || undefined);
}

function installFooterStatus(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    viewportPosition = null;
    updateStatus();
  });

  pi.on("model_select", async () => updateStatus());

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

export default function betterTui(pi: ExtensionAPI): void {
  installFooterStatus(pi);
  installViewportShim(pi);
}
