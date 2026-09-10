import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Match code first so examples are not rewritten as nested Markdown.
const FILE_URL_OR_CODE =
	/(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$)|(`+)([\s\S]*?)\3)|(?:file:\/\/\/|(?<=\]\()(?:\/(?!\/)|~\/)|(?<![\w/])~\/)[^\s<>"'`()\]]+/gm;

function piFileOpenHref(fileUrl: string): string {
	const destination = new URL("pi-file://open");
	destination.searchParams.set("url", fileUrl);
	return destination.href;
}

function pathLastSegmentHasDot(pathOrUrl: string): boolean {
	const pathPart = pathOrUrl.split("#")[0] ?? "";
	const base = pathPart.split("/").pop() ?? "";
	return base.includes(".") && base !== "." && base !== "..";
}

/** Convert an absolute path, `~/` home path, or file:// URL into a file:// URL. */
function toFileUrl(raw: string): string {
	if (raw.startsWith("file:///")) return raw;
	const hashIndex = raw.indexOf("#");
	const pathPart = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? "" : raw.slice(hashIndex);
	const absolute = pathPart.startsWith("~/") ? `${homedir()}/${pathPart.slice(2)}` : pathPart;
	return `${new URL(`file://${absolute}`).href}${fragment}`;
}

/** file:// URL for path-like text: file:///, `~/file`, or `/abs/file` with a dotted file name. */
function fileUrlFromPathLike(text: string): string | null {
	if (!text || /\s/.test(text)) return null;
	if (text.startsWith("file:///")) return text;
	if (text.startsWith("~/") || (text.startsWith("/") && !text.startsWith("//"))) {
		if (!pathLastSegmentHasDot(text)) return null;
		return toFileUrl(text);
	}
	return null;
}

/** Route file URLs, home paths, and path-like inline code through Herdr without changing their labels. */
export function linkifyFileUrls(text: string): string {
	return text.replace(
		FILE_URL_OR_CODE,
		(match, code, fence, _ticks, inlineInner, offset: number, source: string) => {
			if (code) {
				if (fence) return match;
				if (offset > 0 && source[offset - 1] === "[") return match;
				const fileUrl = fileUrlFromPathLike(inlineInner);
				if (!fileUrl) return match;
				return `[${match}](${piFileOpenHref(fileUrl)})`;
			}

			const previous = offset > 0 ? source[offset - 1] : undefined;
			if (previous === "[") return match;

			const isDestination = previous === "(" || previous === "<";
			const stripped = isDestination ? match : match.replace(/[.,;:!?]+$/, "");
			const suffix = match.slice(stripped.length);
			if (stripped.startsWith("~/") && !isDestination && !pathLastSegmentHasDot(stripped)) {
				return match;
			}
			const fileUrl = stripped.startsWith("file:///") ? stripped : toFileUrl(stripped);

			if (isDestination) return piFileOpenHref(fileUrl);
			return `[${stripped}](${piFileOpenHref(fileUrl)})${suffix}`;
		},
	);
}

/** File links are display-only and require the Herdr Pi File Opener plugin. */
export default function openFileLinks(pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1" || !["darwin", "linux"].includes(process.platform)) return;

	pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
		if (messageType === "assistant-thinking" || isStreaming) return markdown;
		return linkifyFileUrls(markdown);
	});
}
