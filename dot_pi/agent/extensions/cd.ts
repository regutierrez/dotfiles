/**
 * /cd — move the session to another working directory (OpenCode-style).
 *
 * Forks the current session into the target directory's session store
 * (SessionManager.forkFrom), then switches to it. switchSession rebuilds the
 * whole runtime — built-in tools, footer, project context, extensions — bound
 * to the new cwd, so this is a real transport, not path rewriting.
 *
 * Tab-completion of directories is provided via getArgumentCompletions.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function shortenHome(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? "~" + p.slice(home.length) : p;
}

export default function cdExtension(pi: ExtensionAPI) {
  let cwd = process.cwd();

  pi.on("session_start", (_event, ctx) => {
    cwd = ctx.cwd;
  });

  // The cwd of the session this one was forked from, for `/cd -`.
  const getPreviousCwd = (ctx: ExtensionCommandContext): string | undefined => {
    const parent = (ctx.sessionManager.getHeader() as { parentSession?: string }).parentSession;
    if (!parent || !fs.existsSync(parent)) return undefined;
    try {
      const firstLine = fs.readFileSync(parent, "utf8").split("\n", 1)[0] ?? "";
      const header = JSON.parse(firstLine) as { cwd?: string };
      return typeof header.cwd === "string" ? header.cwd : undefined;
    } catch {
      return undefined;
    }
  };

  pi.registerCommand("cd", {
    description: "Move the session to another working directory (~, -, relative, absolute)",
    getArgumentCompletions: (argumentPrefix) => {
      const typed = argumentPrefix.trimStart();
      const slash = typed.lastIndexOf("/");
      const typedDir = slash === -1 ? "" : typed.slice(0, slash + 1);
      const fragment = slash === -1 ? typed : typed.slice(slash + 1);
      const scanDir = typedDir === "" ? cwd : path.resolve(cwd, expandHome(typedDir));

      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(scanDir, { withFileTypes: true });
      } catch {
        return null;
      }

      const items: AutocompleteItem[] = [];
      for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!fragment.startsWith(".") && d.name.startsWith(".")) continue;
        if (!d.name.toLowerCase().startsWith(fragment.toLowerCase())) continue;
        const isDir = d.isDirectory() || (d.isSymbolicLink() && isDirectory(path.join(scanDir, d.name)));
        if (!isDir) continue;
        items.push({
          value: `${typedDir}${d.name}/`,
          label: `${d.name}/`,
          description: shortenHome(path.join(scanDir, d.name)),
        });
        if (items.length >= 50) break;
      }
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx: ExtensionCommandContext) => {
      const arg = args.trim();

      if (!arg) {
        ctx.ui.notify(`cwd: ${shortenHome(ctx.cwd)}`, "info");
        return;
      }

      let target: string;
      if (arg === "-") {
        const previous = getPreviousCwd(ctx);
        if (!previous) {
          ctx.ui.notify("cd: no previous directory", "warning");
          return;
        }
        target = previous;
      } else {
        target = path.resolve(ctx.cwd, expandHome(arg));
      }

      if (!isDirectory(target)) {
        ctx.ui.notify(`cd: no such directory: ${target}`, "error");
        return;
      }
      if (target === ctx.cwd) {
        ctx.ui.notify(`cwd already ${shortenHome(target)}`, "info");
        return;
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile || !fs.existsSync(sessionFile)) {
        ctx.ui.notify("cd: session is not persisted; cannot move it", "error");
        return;
      }

      const forked = SessionManager.forkFrom(sessionFile, target);
      const forkedFile = forked.getSessionFile();
      if (!forkedFile) {
        ctx.ui.notify("cd: fork produced no session file", "error");
        return;
      }
      const result = await ctx.switchSession(forkedFile, {
        withSession: async (newCtx) => {
          newCtx.ui.notify(`cwd: ${shortenHome(target)}`, "info");
          await newCtx.sendMessage(
            {
              customType: "cd",
              content: `The session moved to a new working directory: ${target}. Resolve relative paths against it.`,
              display: false,
            },
            { triggerTurn: false },
          );
        },
      });
      if (result.cancelled) {
        fs.rmSync(forkedFile, { force: true });
      }
    },
  });
}
