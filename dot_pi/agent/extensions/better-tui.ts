import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { Editor, TUI, truncateToWidth, visibleWidth, type Component, type EditorTheme } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { homedir } from "node:os";


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
  // Save Pi's original root renderer so we can restore it on shutdown/reload.
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

// Equivalent to pi's CustomEditor, copied locally so the extension does not rely
// on the package root's ESM-only export path at runtime.
export class CompatCustomEditor extends Editor {
  readonly actionHandlers = new Map<string, () => void>();
  onEscape?: () => void;
  onCtrlD?: () => void;
  onPasteImage?: () => void;
  onExtensionShortcut?: (data: string) => boolean;
  private readonly keybindings: KeybindingsManager;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme);
    this.keybindings = keybindings;
  }

  onAction(action: string, handler: () => void): void {
    this.actionHandlers.set(action, handler);
  }

  override handleInput(data: string): void {
    if (this.onExtensionShortcut?.(data)) {
      return;
    }

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

    if (this.keybindings.matches(data, "app.exit" as never)) {
      if (this.getText().length === 0) {
        const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
        handler?.();
        return;
      }
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
  // Pi currently builds the root UI with exactly 8 top-level children.
  // We only depend on that shallow contract, not on transcript internals.
  if (children.length !== EXPECTED_TOP_LEVEL_CHILD_COUNT) return null;
  return {
    transcript: children.slice(0, TRANSCRIPT_CHILD_COUNT),
    dock: children.slice(TRANSCRIPT_CHILD_COUNT),
  };
}

export function renderComponents(children: Component[], width: number): string[] {
  const lines: string[] = [];
  for (const child of children) {
    lines.push(...child.render(width));
  }
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
  // Width changes usually cause line wrapping to change, so detached scroll
  // positions become ambiguous. Reset to follow mode in that case.
  if (state.lastTermWidth > 0 && state.lastTermWidth !== termWidth) {
    resetViewportToFollow(state);
  }

  state.lastTermWidth = termWidth;

  const transcriptHeight = Math.max(0, termRows - dockLines.length);
  state.lastTranscriptHeight = transcriptHeight;
  state.lastTranscriptLineCount = transcriptLines.length;

  const maxScrollTop = computeMaxScrollTop(transcriptLines.length, transcriptHeight);
  if (state.mode === "follow") {
    state.scrollTop = maxScrollTop;
  } else {
    state.scrollTop = clamp(state.scrollTop, 0, maxScrollTop);
  }
  publishViewportPosition(state);

  if (transcriptHeight <= 0) {
    return dockLines.length > termRows ? dockLines.slice(-termRows) : dockLines;
  }

  const visibleTranscript = transcriptLines.slice(state.scrollTop, state.scrollTop + transcriptHeight);
  while (visibleTranscript.length < transcriptHeight) {
    visibleTranscript.push("");
  }

  return [...visibleTranscript, ...dockLines];
}

export function scrollViewportBy(state: ViewportState, deltaLines: number): boolean {
  const transcriptHeight = Math.max(0, state.lastTranscriptHeight);
  const maxScrollTop = computeMaxScrollTop(state.lastTranscriptLineCount, transcriptHeight);
  const currentTop = state.mode === "follow" ? maxScrollTop : clamp(state.scrollTop, 0, maxScrollTop);
  let nextMode = state.mode;
  let nextTop = clamp(currentTop + deltaLines, 0, maxScrollTop);

  if (deltaLines < 0 && maxScrollTop > 0) {
    nextMode = "detached";
  }

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
  if (state.originalRender) {
    return state.originalRender.call(tui, width);
  }
  return renderComponents(tui.children as Component[], width);
}

function disableViewportRuntime(state: ViewportState, reason: string): void {
  const tui = state.tui;
  const requestRender = state.requestRender;

  if (tui) {
    restoreRenderShim(tui, state);
  }

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

  // If another extension already monkey-patched the root render function,
  // refuse to stack another patch on top. That keeps failure modes obvious.
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

  // Replace Pi's top-level render function with our layout shim.
  tui.render = ((width: number) => renderViewportRoot(tui, width, state)) as TUI["render"];
  return true;
}

export function restoreRenderShim(tui: TUI, state: ViewportState): void {
  if (state.originalRender) {
    tui.render = state.originalRender;
    state.originalRender = undefined;
  }
}

export class ViewportEditor extends CompatCustomEditor {
  private readonly viewportKeybindings: KeybindingsManager;
  private readonly viewportState: ViewportState;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, state: ViewportState) {
    super(tui, theme, keybindings);
    this.viewportKeybindings = keybindings;
    this.viewportState = state;
  }

  override handleInput(data: string): void {
    const interceptViewportKey = (direction: -1 | 1): boolean => {
      if (!this.viewportState.installed || this.isShowingAutocomplete()) return false;

      // Move by 3/4 page so there is always context overlap between jumps.
      const pageSize = Math.max(1, Math.floor((this.viewportState.lastTranscriptHeight || 1) * 0.75));
      scrollViewportBy(this.viewportState, direction * pageSize);
      return true;
    };

    if (this.viewportKeybindings.matches(data, "tui.editor.pageUp") && interceptViewportKey(-1)) {
      return;
    }

    if (this.viewportKeybindings.matches(data, "tui.editor.pageDown") && interceptViewportKey(1)) {
      return;
    }

    super.handleInput(data);
  }
}

function teardownViewport(ctx: ExtensionContext | undefined, state: ViewportState, restoreEditor: boolean): void {
  if (state.tui) {
    restoreRenderShim(state.tui, state);
  }

  state.installed = false;
  state.tui = undefined;
  state.requestRender = undefined;
  state.lastPositionKey = undefined;
  resetViewportToFollow(state);

  if (restoreEditor && state.editorInstalled && ctx?.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }

  state.editorInstalled = false;
}

function installViewportEditor(ctx: ExtensionContext, state: ViewportState, pi: ExtensionAPI): void {
  state.notifyWarning = (message: string) => ctx.ui.notify(message, "warning");
  state.notifyPosition = (position) => pi.events.emit("better-tui:viewport-position", position);
  state.lastWarning = undefined;
  state.editorInstalled = true;

  // Pi will call this factory whenever it needs the main editor component.
  // We use that moment to install the render shim exactly once for the active TUI.
  ctx.ui.setEditorComponent((tui, theme, keybindings) => {
    const installed = installRenderShim(tui, state);
    if (!installed) {
      return new CompatCustomEditor(tui, theme, keybindings);
    }

    // Keep transcript paging keyboard-only so tmux/terminal-native mouse
    // selection works without copying scrollbar decorations.
    tui.requestRender();
    return new ViewportEditor(tui, theme, keybindings, state);
  });
}

function installViewportShim(pi: ExtensionAPI): void {
  const state = createViewportState();

  const install = (ctx: ExtensionContext) => {
    teardownViewport(ctx, state, true);
    if (!ctx.hasUI || !isTmuxSession()) return;
    installViewportEditor(ctx, state, pi);
  };

  pi.on("session_start", async (_event, ctx) => {
    install(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    teardownViewport(ctx, state, true);
  });
}

// Small cached snapshot of `git status --porcelain` so we do not spawn git on
// every footer render. The footer can render a lot while Pi is streaming.
type GitCounts = { cwd: string; staged: number; unstaged: number; untracked: number; timestamp: number };

// Pi does not expose auto-compaction settings on the public extension context,
// but the interactive runtime currently provides them. We keep this optional so
// the code stays safe if that private field is absent.
type PiContext = ExtensionContext & { settingsManager?: { getCompactionSettings?: () => { enabled?: boolean } } };
type FooterTheme = { fg: (color: "dim" | "accent" | "success", text: string) => string };

const HOME = homedir();
const GIT_TTL_MS = 1500;
const THINKING_COLORS: Record<string, string> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
};

let gitCache: GitCounts | null = null;
let gitFetchCwd: string | null = null;
// Stored when the footer is mounted so non-render events (tool results, model
// changes, user bash) can ask the UI to redraw.
let currentRequestRender: (() => void) | null = null;
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
let viewportPosition: ViewportPosition | null = null;

function invalidateGit() {
  gitCache = null;
}

// Match pi's built-in footer token formatting thresholds exactly:
// raw under 1k, 1 decimal up to 10k, rounded k up to 1M, then M.
function formatTokens(n: number) {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDir(cwd: string) {
  return cwd.startsWith(HOME) ? `~${cwd.slice(HOME.length)}` : cwd;
}

function formatCost(cost: number) {
  return `$${cost.toFixed(3)}`;
}

function formatRoundedUpContextTokens(n: number) {
  const rounded = Math.ceil(Math.max(0, n) / 100) * 100;
  if (rounded < 1000) return `${rounded}`;
  if (rounded < 1000000) {
    if (rounded % 1000 === 0) return `${rounded / 1000}k`;
    return `${(rounded / 1000).toFixed(1)}k`;
  }
  return formatTokens(rounded);
}

function sanitizeStatusText(text: string) {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function getViewportLabel(position: ViewportPosition | null, theme: FooterTheme) {
  if (!position || position.mode !== "detached") return "";

  const maxScrollTop = Math.max(0, position.transcriptLineCount - Math.max(0, position.transcriptHeight));
  const percent = maxScrollTop > 0 ? Math.round((position.scrollTop / maxScrollTop) * 100) : 100;
  const firstLine = Math.min(position.transcriptLineCount, position.scrollTop + 1);
  const lastLine = Math.min(position.transcriptLineCount, position.scrollTop + position.transcriptHeight);

  return `${theme.fg("accent", `view:${percent}%`)} ${theme.fg(
    "dim",
    `${firstLine}-${lastLine}/${position.transcriptLineCount}`,
  )}`;
}

function parseGitStatus(output: string) {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [x, y] = line;
    if (x === "?" && y === "?") {
      untracked++;
      continue;
    }
    if (x && x !== " ") staged++;
    if (y && y !== " ") unstaged++;
  }
  return { staged, unstaged, untracked };
}

function fetchGitCounts(cwd: string, onDone: () => void) {
  if (gitFetchCwd === cwd) return;
  gitFetchCwd = cwd;

  const proc = spawn("git", ["--no-optional-locks", "status", "--porcelain"], {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
  });

  let stdout = "";
  let settled = false;
  const finish = (counts: ReturnType<typeof parseGitStatus> | null) => {
    if (settled) return;
    settled = true;

    // This fetch can complete by normal process exit, error, or timeout.
    // Clear the timer here so only the first completion path wins.
    clearTimeout(timeout);

    // Only clear the in-flight marker if it still belongs to this cwd.
    // That avoids accidentally wiping a newer fetch that started later.
    if (gitFetchCwd === cwd) gitFetchCwd = null;

    gitCache = {
      cwd,
      staged: counts?.staged ?? 0,
      unstaged: counts?.unstaged ?? 0,
      untracked: counts?.untracked ?? 0,
      timestamp: Date.now(),
    };
    onDone();
  };

  proc.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });
  proc.on("close", (code: number | null) => {
    finish(code === 0 ? parseGitStatus(stdout.trimEnd()) : null);
  });
  proc.on("error", () => {
    finish(null);
  });

  const timeout = setTimeout(() => {
    proc.kill();
    finish(null);
  }, 400);
}

function getGitCounts(cwd: string, onDone: () => void) {
  // Reuse recent results for a short time. This keeps the footer responsive
  // without constantly running git.
  if (gitCache && gitCache.cwd === cwd && Date.now() - gitCache.timestamp < GIT_TTL_MS) {
    return gitCache;
  }
  fetchGitCounts(cwd, onDone);
  return gitCache?.cwd === cwd ? gitCache : { cwd, staged: 0, unstaged: 0, untracked: 0, timestamp: 0 };
}

function getUsageTotals(ctx: ExtensionContext) {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const message = entry.message as AssistantMessage;
    input += message.usage?.input ?? 0;
    output += message.usage?.output ?? 0;
    cacheRead += message.usage?.cacheRead ?? 0;
    cacheWrite += message.usage?.cacheWrite ?? 0;
    cost += message.usage?.cost?.total ?? 0;
  }
  return { input, output, cacheRead, cacheWrite, cost };
}

function getContextSummary(ctx: ExtensionContext, autoCompact: boolean) {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;

  const tokens = typeof usage?.tokens === "number" ? usage.tokens : null;

  let percent: number | null = null;
  if (tokens !== null && contextWindow > 0) {
    percent = (tokens / contextWindow) * 100;
  } else if (typeof usage?.percent === "number") {
    percent = usage.percent;
  }

  const tokenText = tokens === null ? "?" : formatRoundedUpContextTokens(tokens);
  const windowText = contextWindow > 0 ? formatTokens(contextWindow) : "--";
  return {
    percent,
    text: `${tokenText}/${windowText}${autoCompact ? " (auto)" : ""}`,
  };
}

function isUsingSubscription(ctx: ExtensionContext) {
  return ctx.model ? (ctx.modelRegistry.isUsingOAuth(ctx.model) ?? false) : false;
}

function isAutoCompactEnabled(ctx: PiContext) {
  // Private API gap: extensions do not currently get this via footerData/public context.
  return ctx.settingsManager?.getCompactionSettings?.()?.enabled ?? true;
}

function compactTps(tps: number) {
  return `${tps.toFixed(0)}t/s`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function recentTtftAverage() {
  return average(ttftSamples.slice(-5));
}

function saveTtft() {
  if (lastTtft > 0 && lastTtft < 120) {
    ttftSamples.push(lastTtft);
    if (ttftSamples.length > 100) ttftSamples.shift();
  }
}

function getTpsLabel(theme: FooterTheme) {
  if (tpsPhase === "waiting") {
    const recent = recentTtftAverage();
    const suffix = recent > 0 ? `·last ${recent.toFixed(1)}s...` : "...";
    return theme.fg("dim", `waiting${suffix}`);
  }

  if (tpsPhase === "streaming" && lastTps > 0) {
    const speed = theme.fg("accent", compactTps(lastTps));
    const ttft = lastTtft > 0 ? `, ${lastTtft.toFixed(1)}s` : "";
    return `${speed}${ttft}`;
  }

  if (tpsPhase === "finished" && lastTps > 0) {
    const speed = theme.fg("success", compactTps(lastTps));
    const ttft = lastTtft > 0 ? `, ${lastTtft.toFixed(1)}s` : "";
    const output = lastOutputTokens > 0 ? ` ${theme.fg("accent", `↓${lastOutputTokens}`)}` : "";
    const duration = lastStreamDuration > 0 ? ` ${theme.fg("dim", `(${lastStreamDuration.toFixed(1)}s)`)}` : "";
    return `${speed}${ttft}${output}${duration}`;
  }

  if (totalStreamTime > 0 && totalTpsOutput > 0) {
    const avgTps = totalTpsOutput / totalStreamTime;
    const avgTtft = average(ttftSamples);
    const speed = theme.fg("accent", compactTps(avgTps));
    const ttft = avgTtft > 0 ? `, ${avgTtft.toFixed(1)}s` : "";
    return `${speed}${ttft}`;
  }

  return "";
}

function installBetterFooter(pi: ExtensionAPI) {
  pi.events.on("better-tui:viewport-position", (position) => {
    viewportPosition = position as ViewportPosition | null;
    queueMicrotask(() => currentRequestRender?.());
  });

  function installFooter(ctx: PiContext) {
    ctx.ui.setFooter((tui, theme, footerData) => {
      let disposed = false;
      const requestRender = () => {
        if (!disposed) tui.requestRender();
      };
      const unsubscribe = footerData.onBranchChange(() => {
        invalidateGit();
        requestRender();
      });
      currentRequestRender = requestRender;

      return {
        dispose() {
          disposed = true;
          unsubscribe?.();
          if (currentRequestRender === requestRender) currentRequestRender = null;
        },
        invalidate() {},
        render(width: number) {
          // `footerData` gives us a few bits of reactive UI state that are not
          // otherwise exposed to extensions, such as the current git branch and
          // statuses registered by other extensions.
          const branch = footerData.getGitBranch();
          const git = getGitCounts(ctx.cwd, requestRender);
          const usage = getUsageTotals(ctx);
          const context = getContextSummary(ctx, isAutoCompactEnabled(ctx));
          const sessionName = ctx.sessionManager.getSessionName();

          let modelLabel = "no-model";
          if (ctx.model) {
            modelLabel = footerData.getAvailableProviderCount() > 1 ? `${ctx.model.provider}/${ctx.model.id}` : ctx.model.id;
          }

          let gitLabel = "";
          const isDirty = git.staged > 0 || git.unstaged > 0 || git.untracked > 0;
          if (branch || isDirty) {
            const gitParts = [theme.fg(isDirty ? "warning" : "success", `git:${branch ?? "repo"}`)];
            if (git.unstaged) gitParts.push(theme.fg("warning", `*${git.unstaged}`));
            if (git.staged) gitParts.push(theme.fg("success", `+${git.staged}`));
            if (git.untracked) gitParts.push(theme.fg("muted", `?${git.untracked}`));
            gitLabel = gitParts.join(" ");
          }

          const ioParts = [`↑${formatTokens(usage.input)}`, `↓${formatTokens(usage.output)}`];
          if (usage.cacheRead) ioParts.push(`R${formatTokens(usage.cacheRead)}`);
          if (usage.cacheWrite) ioParts.push(`W${formatTokens(usage.cacheWrite)}`);

          const costBase = theme.fg("dim", formatCost(usage.cost));
          const costSummary = isUsingSubscription(ctx) ? `${costBase} ${theme.fg("muted", "(sub)")}` : costBase;

          let contextText = theme.fg("muted", context.text);
          if (context.percent !== null) {
            if (context.percent >= 90) contextText = theme.fg("error", context.text);
            else if (context.percent >= 70) contextText = theme.fg("warning", context.text);
          }

          const thinkingLevel = ctx.model?.reasoning ? pi.getThinkingLevel() : null;
          const thinkingLabel = thinkingLevel ? theme.fg(THINKING_COLORS[thinkingLevel] ?? "muted", `think:${thinkingLevel}`) : "";

          const tpsLabel = getTpsLabel(theme);
          const viewportLabel = getViewportLabel(viewportPosition, theme);

          // Statuses come from other extensions calling ctx.ui.setStatus().
          // Sort for stable output, then sanitize so one extension cannot break
          // the footer layout with embedded newlines or tabs.
          const statusParts: string[] = [];
          const statusEntries = Array.from(footerData.getExtensionStatuses().entries()).sort(([a], [b]) => a.localeCompare(b));
          for (const [, text] of statusEntries) {
            const cleaned = sanitizeStatusText(text);
            if (cleaned) statusParts.push(cleaned);
          }

          const row1Parts = [
            theme.fg("text", formatDir(ctx.cwd)),
            sessionName ? theme.fg("accent", sessionName) : "",
            gitLabel,
            theme.fg("accent", modelLabel),
            thinkingLabel,
          ].filter(Boolean);

          const row2Parts = [
            theme.fg("muted", ioParts.join(" ")),
            tpsLabel,
            costSummary,
            contextText,
            viewportLabel,
            ...statusParts,
          ].filter(Boolean);

          const separator = theme.fg("dim", " · ");
          const fullLine = [...row1Parts, ...row2Parts].join(separator);

          if (visibleWidth(fullLine) <= width) {
            return [truncateToWidth(fullLine, width, theme.fg("dim", "…"))];
          }

          const lines = [truncateToWidth(row1Parts.join(separator), width, theme.fg("dim", "…"))];
          if (row2Parts.length > 0) {
            lines.push(truncateToWidth(row2Parts.join(separator), width, theme.fg("dim", "…")));
          }
          return lines;
        },
      };
    });
  }

  function refreshGit() {
    invalidateGit();
    currentRequestRender?.();
  }

  pi.on("session_start", async (_event, ctx) => {
    invalidateGit();
    viewportPosition = null;
    if (ctx.hasUI) installFooter(ctx as PiContext);
  });
  pi.on("session_switch", async (_event, ctx) => {
    invalidateGit();
    viewportPosition = null;
    if (ctx.hasUI) installFooter(ctx as PiContext);
  });
  pi.on("tool_result", async (event) => {
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "bash") {
      refreshGit();
    }
  });
  pi.on("user_bash", async () => {
    refreshGit();
  });
  pi.on("model_select", async () => {
    currentRequestRender?.();
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
    currentRequestRender?.();
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
    if (elapsed > 0.1) {
      lastTps = charsAccumulated / 4 / elapsed;
    }
    currentRequestRender?.();
  });
  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const elapsed = streamStart > 0 ? (performance.now() - streamStart) / 1000 : 0;
    const outputTokens = (event.message as AssistantMessage).usage?.output ?? 0;
    lastOutputTokens = outputTokens;
    lastStreamDuration = elapsed;

    if (elapsed > 0.1 && outputTokens > 0) {
      lastTps = outputTokens / elapsed;
      totalTpsOutput += outputTokens;
      totalStreamTime += elapsed;
    }

    tpsPhase = "finished";
    tpsStreaming = false;
    currentRequestRender?.();
  });
  pi.on("turn_end", async () => {
    saveTtft();
    if (!tpsStreaming) tpsPhase = "idle";
    currentRequestRender?.();
  });
}

export default function betterTui(pi: ExtensionAPI): void {
  installBetterFooter(pi);
  installViewportShim(pi);
}
