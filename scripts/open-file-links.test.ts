import assert from "node:assert/strict";
import { homedir } from "node:os";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import openFileLinks, { linkifyFileUrls } from "../dot_pi/agent/extensions/open-file-links.ts";

function destination(fileUrl: string) {
	const url = new URL("pi-file://open");
	url.searchParams.set("url", fileUrl);
	return url.href;
}

for (const url of ["file:///tmp/a.ts", "file:///tmp/a%20file.ts#L3", "file:///tmp/a.ts#L3-L8"]) {
	test(`renders a clickable file link: ${url}`, () => {
		assert.equal(linkifyFileUrls(url), `[${url}](${destination(url)})`);
		assert.equal(linkifyFileUrls(`[source](${url})`), `[source](${destination(url)})`);
		const linked = linkifyFileUrls(url);
		assert.equal(linkifyFileUrls(linked), linked);
	});
}

test("routes the HANDOFF.md absolute-path link without changing its label", () => {
	const path = "/tmp/non-code-skill-debloat.DR3V32/HANDOFF.md";
	assert.equal(linkifyFileUrls(`Created [HANDOFF.md](${path}).`),
		`Created [HANDOFF.md](${destination(`file://${path}`)}).`);
});

for (const path of ["/tmp/a.ts#L3-L8", "/tmp/a%20file.ts", "/tmp/a.ts"]) {
	test(`routes an absolute Markdown destination: ${path}`, () => {
		const markdown = `[source](${path})`;
		const linked = `[source](${destination(`file://${path}`)})`;
		assert.equal(linkifyFileUrls(markdown), linked);
		assert.equal(linkifyFileUrls(linked), linked);
		assert.equal(linkifyFileUrls(`\`${markdown}\``), `\`${markdown}\``);
	});
}

test("does not rewrite plain paths, relative paths, or protocol-relative web URLs", () => {
	const markdown = "/tmp/a.ts [source](src/a.ts) [web](//example.com/a.ts)";
	assert.equal(linkifyFileUrls(markdown), markdown);
});

test("preserves autolinks, punctuation, and web links", () => {
	const url = "file:///tmp/a.ts#L3";
	assert.equal(linkifyFileUrls(`<${url}>`), `<${destination(url)}>`);
	assert.equal(linkifyFileUrls(`See ${url}.`), `See [${url}](${destination(url)}).`);
	assert.equal(linkifyFileUrls("[web](https://example.com/a.ts#L3)"), "[web](https://example.com/a.ts#L3)");
});

test("keeps fenced code unchanged", () => {
	const markdown = "```text\nfile:///tmp/a.ts#L3\n~/repos/foo/index.mdx\n```";
	assert.equal(linkifyFileUrls(markdown), markdown);
});

test("keeps non-path inline code unchanged", () => {
	const markdown = "`const x = 1` `/projects/1599969/deployment/audience` `src/foo.ts` `~/bin`";
	assert.equal(linkifyFileUrls(markdown), markdown);
});

test("wraps path-like inline code as a clickable file link", () => {
	const homeFile = `~/repos/investigatr/main/src/content/investigations/AKKIO-16206/index.mdx`;
	const absFile = "/tmp/a.ts#L3";
	const fileUrl = "file:///tmp/a.ts#L3";
	assert.equal(
		linkifyFileUrls(`\`${homeFile}\``),
		`[\`${homeFile}\`](${destination(new URL(`file://${homedir()}/${homeFile.slice(2)}`).href)})`,
	);
	assert.equal(
		linkifyFileUrls(`\`${absFile}\``),
		`[\`${absFile}\`](${destination(new URL(`file://${absFile}`).href)})`,
	);
	assert.equal(
		linkifyFileUrls(`\`${fileUrl}\``),
		`[\`${fileUrl}\`](${destination(fileUrl)})`,
	);
});

test("wraps prose home paths that look like files", () => {
	const homeFile = "~/repos/foo/index.mdx";
	const fileUrl = new URL(`file://${homedir()}/${homeFile.slice(2)}`).href;
	assert.equal(linkifyFileUrls(`See ${homeFile}.`), `See [${homeFile}](${destination(fileUrl)}).`);
	assert.equal(linkifyFileUrls("See ~/bin."), "See ~/bin.");
});

test("routes a home-path Markdown destination", () => {
	const homeFile = "~/repos/foo/index.mdx";
	const fileUrl = new URL(`file://${homedir()}/${homeFile.slice(2)}`).href;
	assert.equal(linkifyFileUrls(`[source](${homeFile})`), `[source](${destination(fileUrl)})`);
});

test("does not double-wrap path-like inline code", () => {
	const inner = "`/tmp/a.ts`";
	const linked = linkifyFileUrls(inner);
	assert.equal(linkifyFileUrls(linked), linked);
});

test("uses the display transformer for finalized and restored assistant messages", () => {
	const previous = process.env.HERDR_ENV;
	process.env.HERDR_ENV = "1";
	try {
		let transformer: Parameters<ExtensionAPI["registerMarkdownTransformer"]>[0] | undefined;
		openFileLinks({ registerMarkdownTransformer(fn) { transformer = fn; } } as Parameters<typeof openFileLinks>[0]);
		assert.ok(transformer);
		const url = "file:///tmp/a.ts";
		assert.equal(transformer(url, { messageType: "assistant", isStreaming: false, availableWidth: 80 }), linkifyFileUrls(url));
		assert.equal(transformer(url, { messageType: "assistant", isStreaming: true, availableWidth: 80 }), url);
		assert.equal(transformer(url, { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 }), url);
	} finally {
		if (previous === undefined) delete process.env.HERDR_ENV;
		else process.env.HERDR_ENV = previous;
	}
});
