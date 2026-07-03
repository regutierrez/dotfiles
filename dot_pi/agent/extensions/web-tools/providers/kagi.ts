import { decodeTextBuffer, isAbortError, parseContentType, readBodyWithLimit } from "../network.ts";
import { err, ok, type Result } from "../result.ts";
import { parsePublicHttpUrl, type PublicHttpUrl } from "../types.ts";
import { MAX_SEARCH_RESPONSE_BYTES } from "./exa.ts";
import { parseExaMcpResponse } from "./exa-protocol.ts";
import type { NormalizedSearchResult, SearchProvider, SearchProviderError, SearchProviderRequest } from "./types.ts";

export class KagiSearchProvider implements SearchProvider {
	readonly name = "kagi" as const;

	constructor(private readonly endpoint: PublicHttpUrl) {}

	/** Search through Kagi's hosted MCP server and return normalized public-web results. */
	async search(
		input: SearchProviderRequest,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Result<readonly NormalizedSearchResult[], SearchProviderError>> {
		const apiKey = process.env.KAGI_API_KEY?.trim();
		if (!apiKey) {
			return err({ _tag: "SearchProviderReturnedError", provider: this.name, safeMessage: "KAGI_API_KEY is not set" });
		}

		let response: Response;
		try {
			response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${apiKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(encodeKagiMcpSearchRequest(input)),
				signal: options.signal,
			});
		} catch (cause: unknown) {
			if (options.signal?.aborted || isAbortError(cause)) {
				return err({ _tag: "SearchProviderCancelled", provider: this.name, cause });
			}
			return err({ _tag: "SearchProviderUnavailable", provider: this.name, cause });
		}

		if (response.status < 200 || response.status >= 300) {
			await response.body?.cancel().catch(() => undefined);
			return err({ _tag: "SearchProviderStatusRejected", provider: this.name, status: response.status });
		}

		const contentLength = response.headers.get("content-length");
		if (contentLength) {
			const declaredBytes = Number.parseInt(contentLength, 10);
			if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SEARCH_RESPONSE_BYTES) {
				await response.body?.cancel().catch(() => undefined);
				return err({ _tag: "SearchProviderResponseTooLarge", provider: this.name, maxBytes: MAX_SEARCH_RESPONSE_BYTES });
			}
		}

		try {
			const parsedContentType = parseContentType(response.headers.get("content-type"));
			const body = await readBodyWithLimit(response, MAX_SEARCH_RESPONSE_BYTES, options.signal);
			const decoded = decodeTextBuffer(body.buffer, parsedContentType.charset);
			return parseKagiMcpSearchResponse(decoded.text, parsedContentType.contentType, input.maxResults);
		} catch (cause: unknown) {
			if (options.signal?.aborted || isAbortError(cause)) {
				return err({ _tag: "SearchProviderCancelled", provider: this.name, cause });
			}
			if (cause instanceof Error && cause.message.startsWith("Response too large")) {
				return err({ _tag: "SearchProviderResponseTooLarge", provider: this.name, maxBytes: MAX_SEARCH_RESPONSE_BYTES });
			}
			return err({ _tag: "SearchProviderUnavailable", provider: this.name, cause });
		}
	}
}

function encodeKagiMcpSearchRequest(input: SearchProviderRequest) {
	return {
		jsonrpc: "2.0",
		id: "web-tools-search",
		method: "tools/call",
		params: {
			name: "kagi_search_fetch",
			arguments: {
				query: input.query,
				workflow: "search",
				limit: input.maxResults,
				extract_count: 0,
			},
		},
	};
}

export function parseKagiMcpSearchResponse(
	bodyText: string,
	contentType: string,
	maxResults: number,
): Result<readonly NormalizedSearchResult[], SearchProviderError> {
	const protocol = parseExaMcpResponse(bodyText, contentType);
	if (protocol._tag === "err") {
		return err({ _tag: "SearchProviderProtocolInvalid", provider: "kagi", reason: "Invalid MCP response" });
	}

	const providerError = protocol.value.find((message) => message._tag === "ProviderError");
	if (providerError?._tag === "ProviderError") {
		return err({ _tag: "SearchProviderReturnedError", provider: "kagi", safeMessage: providerError.safeMessage });
	}

	const searchText = protocol.value
		.filter((message) => message._tag === "Text")
		.map((message) => message.text)
		.join("\n\n")
		.trim();

	const results = parseKagiMcpMarkdownResults(searchText).slice(0, maxResults);
	if (results.length === 0) {
		return err({ _tag: "SearchProviderNoRecognizedResults", provider: "kagi" });
	}

	return ok(results);
}

export function parseKagiMcpMarkdownResults(markdown: string): readonly NormalizedSearchResult[] {
	const sections = markdown.split(/\n(?=### \[)/g);
	return sections.flatMap((section): NormalizedSearchResult[] => {
		const heading = /^### \[([^\]]+)]\(([^)]+)\)/m.exec(section);
		if (!heading) return [];

		const title = stripHtml(heading[1] ?? "").trim();
		const parsedUrl = parsePublicHttpUrl(heading[2] ?? "");
		if (!title || parsedUrl._tag === "err") return [];

		const published = /^\*\*Published:\*\*\s*(.+)$/m.exec(section)?.[1]?.trim();
		const snippet = section
			.replace(/^### .+$/m, "")
			.replace(/^\*\*URL:\*\*\s*.+$/m, "")
			.replace(/^\*\*Published:\*\*\s*.+$/m, "")
			.replace(/^## .+$/gm, "")
			.trim();

		return [
			{
				title,
				url: parsedUrl.value,
				snippet: snippet ? stripHtml(snippet) : undefined,
				publishedAt: published,
				source: new URL(parsedUrl.value).hostname,
			},
		];
	});
}

function stripHtml(value: string): string {
	return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
