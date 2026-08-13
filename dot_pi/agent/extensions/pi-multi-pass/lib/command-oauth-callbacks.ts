/**
 * Build OAuth login callbacks from a Pi command UI.
 * Opens the authorization URL in the local browser when possible.
 */

import { spawn } from "node:child_process";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { OAuthLoginCallbacks } from "@earendil-works/pi-ai/oauth";

/**
 * Create the OAuth callback surface used by /subs login.
 */
export function createCommandOAuthCallbacks(
	ctx: ExtensionCommandContext,
): OAuthLoginCallbacks {
	return {
		onAuth(info) {
			ctx.ui.notify(info.instructions ?? `Open this login URL: ${info.url}`, "info");
			openAuthorizationUrl(info.url);
		},
		onDeviceCode(info) {
			ctx.ui.notify(
				`Device login: enter ${info.userCode} at ${info.verificationUri}`,
				"info",
			);
			openAuthorizationUrl(info.verificationUri);
		},
		async onPrompt(prompt) {
			const value = await ctx.ui.input(prompt.message, prompt.placeholder);
			if (value == null || (!prompt.allowEmpty && value.trim() === "")) {
				throw new Error("Login cancelled");
			}
			return value;
		},
		onProgress(message) {
			ctx.ui.notify(message, "info");
		},
		async onManualCodeInput() {
			const value = await ctx.ui.input(
				"Paste the redirect URL or authorization code",
				"http://localhost:1455/auth/callback?code=...",
			);
			if (value == null || value.trim() === "") {
				throw new Error("Login cancelled");
			}
			return value;
		},
		async onSelect(prompt) {
			const labels = prompt.options.map((option) => option.label);
			const selected = await ctx.ui.select(prompt.message, labels);
			if (!selected) return undefined;
			return prompt.options.find((option) => option.label === selected)?.id;
		},
	};
}

function openAuthorizationUrl(url: string): void {
	const command = process.platform === "darwin"
		? "open"
		: process.platform === "win32"
			? "cmd"
			: "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		spawn(command, args, { detached: true, stdio: "ignore" }).unref();
	} catch {
		// The user can still open the URL from the notification.
	}
}
