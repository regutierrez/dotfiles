import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FILE_URL_WITH_LINES = /file:\/\/\/[^\s<>"'`()\]#]+#L\d+(?:-L?\d+)?/g;

export function linkifyFileUrls(text: string): string {
	return text.replace(FILE_URL_WITH_LINES, (fileUrl, offset: number, source: string) => {
		const previous = offset > 0 ? source[offset - 1] : undefined;
		// Do not nest a link when the URL is already its label or inline code.
		if (previous === "[" || previous === "`") return fileUrl;

		const destination = new URL("pi-file://open");
		destination.searchParams.set("url", fileUrl);

		// Preserve existing Markdown links and autolinks, replacing only their target.
		if (previous === "(" || previous === "<") return destination.href;
		return `[${fileUrl}](${destination.href})`;
	});
}

export default function (pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1" || !["darwin", "linux"].includes(process.platform)) return;

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;

		let changed = false;
		const content = event.message.content.map((part) => {
			if (part.type !== "text") return part;
			const text = linkifyFileUrls(part.text);
			if (text === part.text) return part;
			changed = true;
			return { ...part, text };
		});

		if (!changed) return;
		return { message: { ...event.message, content } };
	});
}
