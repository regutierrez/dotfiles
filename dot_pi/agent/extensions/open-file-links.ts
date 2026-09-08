import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Match code first so examples are not rewritten as nested Markdown.
const FILE_URL_OR_CODE = /(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$)|(`+)[\s\S]*?\3)|(?:file:\/\/\/|(?<=\]\()\/(?!\/))[^\s<>"'`()\]]+/gm;

/** Route file URLs and absolute Markdown file links through Herdr without changing their labels. */
export function linkifyFileUrls(text: string): string {
	return text.replace(FILE_URL_OR_CODE, (match, code, _fence, _ticks, offset: number, source: string) => {
		if (code) return match;
		const previous = offset > 0 ? source[offset - 1] : undefined;
		if (previous === "[") return match;

		const isDestination = previous === "(" || previous === "<";
		const fileUrl = isDestination ? match : match.replace(/[.,;:!?]+$/, "");
		const suffix = match.slice(fileUrl.length);
		const destination = new URL("pi-file://open");
		destination.searchParams.set("url", fileUrl.startsWith("/") ? new URL(`file://${fileUrl}`).href : fileUrl);

		if (isDestination) return destination.href;
		return `[${fileUrl}](${destination.href})${suffix}`;
	});
}

/** File links are display-only and require the Herdr Pi File Opener plugin. */
export default function openFileLinks(pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1" || !["darwin", "linux"].includes(process.platform)) return;

	pi.registerMarkdownTransformer((markdown, { messageType, isStreaming }) => {
		if (messageType === "assistant-thinking" || isStreaming) return markdown;
		return linkifyFileUrls(markdown);
	});
}
