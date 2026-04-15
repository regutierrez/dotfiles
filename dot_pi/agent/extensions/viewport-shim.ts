import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { Editor, TUI, visibleWidth, type Component, type EditorTheme } from "@mariozechner/pi-tui";

export type ViewportMode = "follow" | "detached";

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
const WARNING_PREFIX = "Viewport shim disabled:";

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
}

function padLineToWidth(line: string, width: number): string {
  const padding = Math.max(0, width - visibleWidth(line));
  return padding > 0 ? `${line}${" ".repeat(padding)}` : line;
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
  const transcriptWidth = Math.max(0, termWidth - 1);
  const shouldRenderScrollbar = transcriptWidth > 0 && transcriptLines.length > transcriptHeight;
  if (state.mode === "follow") {
    state.scrollTop = maxScrollTop;
  } else {
    state.scrollTop = clamp(state.scrollTop, 0, maxScrollTop);
  }

  if (transcriptHeight <= 0) {
    return dockLines.length > termRows ? dockLines.slice(-termRows) : dockLines;
  }

  const visibleTranscript = transcriptLines.slice(state.scrollTop, state.scrollTop + transcriptHeight);
  while (visibleTranscript.length < transcriptHeight) {
    visibleTranscript.push("");
  }

  const scrollbarTrackHeight = transcriptHeight;
  const scrollbarThumbHeight = shouldRenderScrollbar
    ? Math.max(1, Math.round((transcriptHeight / transcriptLines.length) * scrollbarTrackHeight))
    : 0;
  const scrollbarThumbTop = shouldRenderScrollbar
    ? maxScrollTop === 0
      ? 0
      : Math.min(
          scrollbarTrackHeight - scrollbarThumbHeight,
          Math.round((state.scrollTop / maxScrollTop) * (scrollbarTrackHeight - scrollbarThumbHeight)),
        )
    : 0;

  const transcriptWithScrollbar = shouldRenderScrollbar
    ? visibleTranscript.map((line, index) => {
        const baseLine = padLineToWidth(line, transcriptWidth);
        const isThumbLine =
          index >= scrollbarThumbTop && index < scrollbarThumbTop + scrollbarThumbHeight;
        return `${baseLine}${isThumbLine ? "█" : "│"}`;
      })
    : visibleTranscript.map((line) => `${padLineToWidth(line, transcriptWidth)} `);

  return [...transcriptWithScrollbar, ...dockLines];
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
  const transcriptWidth = Math.max(0, width - 1);
  const transcriptLines = renderComponents(sections.transcript, transcriptWidth);

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
  resetViewportToFollow(state);

  if (restoreEditor && state.editorInstalled && ctx?.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }

  state.editorInstalled = false;
}

function installViewportEditor(ctx: ExtensionContext, state: ViewportState): void {
  state.notifyWarning = (message: string) => ctx.ui.notify(message, "warning");
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
    // selection continues to work for copying text from the viewport.
    tui.requestRender();
    return new ViewportEditor(tui, theme, keybindings, state);
  });
}

export default function viewportShim(pi: ExtensionAPI): void {
  const state = createViewportState();

  const install = (ctx: ExtensionContext) => {
    teardownViewport(ctx, state, true);
    if (!ctx.hasUI || !isTmuxSession()) return;
    installViewportEditor(ctx, state);
  };

  pi.on("session_start", async (_event, ctx) => {
    install(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    teardownViewport(ctx, state, true);
  });
}
