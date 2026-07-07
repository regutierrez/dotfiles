/**
 * Junior Mode Extension
 *
 * Toggleable teaching mode: when on, the agent explains concepts plainly for
 * junior developers — worked examples, ASCII diagrams, no jargon.
 *
 * Usage:
 * - /junior — toggle on/off
 * - ctrl+alt+j — same toggle (TUI)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

const JUNIOR_MODE_ENTRY = "junior-mode";

type JuniorModeState = {
	enabled: boolean;
};

const JUNIOR_MODE_PROMPT = `

## Junior teaching mode (ACTIVE)

You are explaining to a junior developer. Override terse communication rules for this turn.

### Voice
- Plain English. Short sentences. Say what things *do*, not what they "represent".
- If you must use a technical term, define it in one simple sentence first.
- Avoid jargon and fancy words unless the user asked for them. Skip words like: canonical, idempotent, polymorphic, orthogonal, leverage, utilize, paradigm, semantics, abstraction (unless you immediately unpack it).

### Explain concepts
When you introduce or rely on a concept the user may not know:
1. One-sentence plain definition ("X is …")
2. Tiny worked example with concrete values (numbers, short code, real filenames)
3. ASCII diagram when it helps — flows, before/after, layers, request paths, data shape:

\`\`\`
  browser --> API --> database
     |                  |
     v                  v
  form submit        row saved
\`\`\`

Use diagrams for: control flow, file layout, client/server, state changes, "what runs when".

### Work still gets done
- Still implement, fix, and verify when asked. Teaching is additive, not a substitute for action.
- Separate "what I did" from "why it works" when both matter.
- Code citations stay precise; explanations around them stay plain.

### Length
- Be thorough on concepts; stay focused on the task. No filler paragraphs.
`;

export default function juniorModeExtension(pi: ExtensionAPI): void {
	let enabled = false;

	function persistState(): void {
		pi.appendEntry<JuniorModeState>(JUNIOR_MODE_ENTRY, { enabled });
	}

	function restoreState(ctx: ExtensionContext): void {
		const branch = ctx.sessionManager.getBranch();
		for (const entry of branch) {
			if (entry.type === "custom" && entry.customType === JUNIOR_MODE_ENTRY) {
				const data = entry.data as JuniorModeState | undefined;
				if (typeof data?.enabled === "boolean") {
					enabled = data.enabled;
				}
			}
		}
		updateStatus(ctx);
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(
			"junior-mode",
			enabled ? ctx.ui.theme.fg("accent", "📚 junior") : undefined,
		);
	}

	function toggle(ctx: ExtensionContext): void {
		enabled = !enabled;
		persistState();
		updateStatus(ctx);
		if (ctx.hasUI) {
			ctx.ui.notify(
				enabled
					? "Junior mode on — plain explanations, examples, ASCII diagrams"
					: "Junior mode off — normal terse replies",
				"info",
			);
		}
	}

	pi.registerCommand("junior", {
		description: "Toggle junior dev teaching mode (plain explanations, examples, ASCII diagrams)",
		handler: async (_args, ctx) => toggle(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("j"), {
		description: "Toggle junior dev teaching mode",
		handler: async (ctx) => toggle(ctx),
	});

	pi.on("before_agent_start", async (event) => {
		if (!enabled) return undefined;
		return {
			systemPrompt: event.systemPrompt + JUNIOR_MODE_PROMPT,
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreState(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreState(ctx);
	});
}
