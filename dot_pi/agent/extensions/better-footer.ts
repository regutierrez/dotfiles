import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

// Small cached snapshot of `git status --porcelain` so we do not spawn git on
// every footer render. The footer can render a lot while Pi is streaming.
type GitCounts = { cwd: string; staged: number; unstaged: number; untracked: number; timestamp: number };

// Pi does not expose auto-compaction settings on the public extension context,
// but the interactive runtime currently provides them. We keep this optional so
// the code stays safe if that private field is absent.
type PiContext = ExtensionContext & { settingsManager?: { getCompactionSettings?: () => { enabled?: boolean } } };

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
let lastMessageStart = 0;
let lastMessageEnd = 0;
let lastMessageOutput = 0;

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

function sanitizeStatusText(text: string) {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
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

  let percent: number | null = null;
  if (typeof usage?.percent === "number") {
    percent = usage.percent;
  } else if (typeof usage?.tokens === "number" && typeof usage?.contextWindow === "number" && usage.contextWindow > 0) {
    percent = (usage.tokens / usage.contextWindow) * 100;
  }

  const percentText = percent === null ? "?" : `${percent.toFixed(1)}%`;
  const windowText = contextWindow > 0 ? formatTokens(contextWindow) : "--";
  return {
    percent,
    text: `${percentText}/${windowText}${autoCompact ? " (auto)" : ""}`,
  };
}

function isUsingSubscription(ctx: ExtensionContext) {
  return ctx.model ? (ctx.modelRegistry.isUsingOAuth(ctx.model) ?? false) : false;
}

function isAutoCompactEnabled(ctx: PiContext) {
  // Private API gap: extensions do not currently get this via footerData/public context.
  return ctx.settingsManager?.getCompactionSettings?.()?.enabled ?? true;
}

export default function betterFooter(pi: ExtensionAPI) {
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

          let tpsLabel = "";
          if (lastMessageStart > 0 && lastMessageOutput > 0) {
            const end = lastMessageEnd || Date.now();
            const duration = (end - lastMessageStart) / 1000;
            if (duration > 0) {
              const tps = lastMessageOutput / duration;
              tpsLabel = theme.fg("dim", `${tps.toFixed(1)} tps`);
            }
          }

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
    if (ctx.hasUI) installFooter(ctx as PiContext);
  });
  pi.on("session_switch", async (_event, ctx) => {
    invalidateGit();
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
  pi.on("message_start", async (event) => {
    if (event.message.role === "assistant") {
      lastMessageStart = Date.now();
      lastMessageEnd = 0;
      lastMessageOutput = 0;
    }
  });
  pi.on("message_update", async (event) => {
    if (event.message.role === "assistant") {
      lastMessageOutput = (event.message as AssistantMessage).usage?.output ?? 0;
      currentRequestRender?.();
    }
  });
  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant") {
      lastMessageEnd = Date.now();
      lastMessageOutput = (event.message as AssistantMessage).usage?.output ?? 0;
      currentRequestRender?.();
    }
  });
}
