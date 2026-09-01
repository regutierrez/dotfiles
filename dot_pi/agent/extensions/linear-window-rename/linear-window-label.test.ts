import assert from "node:assert/strict";
import test from "node:test";
import {
	buildLinearWindowLabel,
	buildLinearWindowListArgs,
	buildLinearWindowRenameArgs,
	extractLinearIssueId,
	isHerdrWindowSession,
	localWindowNumberInSpace,
	normalizeLinearIssueId,
	parseHerdrTabList,
	parseHerdrTabWindow,
	resolveHerdrWindowEnv,
	shouldRenameLinearWindow,
	workspaceIdFromTabId,
} from "./linear-window-label.ts";

test("requires HERDR_ENV=1 and a tab id", () => {
	assert.equal(isHerdrWindowSession({}), false);
	assert.deepEqual(resolveHerdrWindowEnv({}), {
		ok: false,
		reason: "linear-window-rename: not inside a Herdr session",
	});
	assert.deepEqual(resolveHerdrWindowEnv({ HERDR_ENV: "1" }), {
		ok: false,
		reason: "linear-window-rename: HERDR_TAB_ID is missing",
	});
	assert.deepEqual(resolveHerdrWindowEnv({ HERDR_ENV: "1", HERDR_TAB_ID: "w2K:t8" }), {
		ok: true,
		tabId: "w2K:t8",
		workspaceId: "w2K",
		herdrBin: "herdr",
	});
	assert.deepEqual(
		resolveHerdrWindowEnv({
			HERDR_ENV: "1",
			HERDR_TAB_ID: "w2K:t8",
			HERDR_WORKSPACE_ID: "w2K",
			HERDR_BIN_PATH: "/opt/herdr",
		}),
		{ ok: true, tabId: "w2K:t8", workspaceId: "w2K", herdrBin: "/opt/herdr" },
	);
	assert.equal(workspaceIdFromTabId("w2N:tY"), "w2N");
});

test("extracts a Linear issue id from prompt text or a linear.app URL", () => {
	assert.equal(extractLinearIssueId("hey, can you @rca TRI-1234"), "TRI-1234");
	assert.equal(extractLinearIssueId("please investigate AKKIO-99 today"), "AKKIO-99");
	assert.equal(
		extractLinearIssueId("https://linear.app/akkio/issue/TRI-1234/some-title"),
		"TRI-1234",
	);
	assert.equal(
		extractLinearIssueId("see linear.app/akkio/issue/ENG-7#comment-abc"),
		"ENG-7",
	);
	assert.equal(extractLinearIssueId("tri-42 in the starting user prompt"), "TRI-42");
	assert.equal(
		extractLinearIssueId("https://linear.app/akkio/issue/TRI-9/foo and also ENG-8"),
		"TRI-9",
	);
	assert.equal(extractLinearIssueId("no ticket in this prompt"), undefined);
	assert.equal(extractLinearIssueId("email me at user@akkio.com"), undefined);
});

test("normalizes Linear issue ids to uppercase TEAM-123", () => {
	assert.equal(normalizeLinearIssueId("tri-1234"), "TRI-1234");
	assert.equal(normalizeLinearIssueId("  ENG-7  "), "ENG-7");
});

test("uses 1-based tab order inside the space, not public tab.number", () => {
	const tabs = parseHerdrTabList({
		id: "cli:tab:list",
		result: {
			type: "tab_list",
			tabs: [
				{ tab_id: "w2N:t1", number: 1, label: "processes" },
				{ tab_id: "w2N:tS", number: 25, label: "dotfiles" },
				{ tab_id: "w2N:tX", number: 29, label: "3" },
				{ tab_id: "w2N:tY", number: 30, label: "4" },
			],
		},
	});
	assert.equal(localWindowNumberInSpace(tabs, "w2N:t1"), 1);
	assert.equal(localWindowNumberInSpace(tabs, "w2N:tS"), 2);
	assert.equal(localWindowNumberInSpace(tabs, "w2N:tX"), 3);
	assert.equal(localWindowNumberInSpace(tabs, "w2N:tY"), 4);
	assert.equal(localWindowNumberInSpace(tabs, "w2N:missing"), undefined);
});

test("builds the window name X: TRI-1234 from the local window number", () => {
	assert.equal(buildLinearWindowLabel(4, "TRI-1234"), "4: TRI-1234");
	assert.equal(buildLinearWindowLabel(3, "TRI-1234"), "3: TRI-1234");
	assert.equal(buildLinearWindowLabel(2, "AKKIO-99"), "2: AKKIO-99");
});

test("renames only a bare-number Herdr window label", () => {
	assert.equal(shouldRenameLinearWindow(undefined, 3, "TRI-1234"), true);
	assert.equal(shouldRenameLinearWindow("", 3, "TRI-1234"), true);
	assert.equal(shouldRenameLinearWindow("  ", 3, "TRI-1234"), true);
	assert.equal(shouldRenameLinearWindow("3", 3, "TRI-1234"), true);
	assert.equal(shouldRenameLinearWindow("4", 4, "TRI-1234"), true);
	assert.equal(shouldRenameLinearWindow("4: TRI-1234", 4, "TRI-1234"), false);
	assert.equal(shouldRenameLinearWindow("dotfiles", 2, "TRI-1234"), false);
	assert.equal(shouldRenameLinearWindow("triage + rca", 3, "TRI-1234"), false);
});

test("parses herdr tab get JSON for the window label", () => {
	assert.deepEqual(
		parseHerdrTabWindow({
			id: "cli:tab:get",
			result: {
				type: "tab_info",
				tab: {
					tab_id: "w2K:t8",
					number: 3,
					label: "3",
					workspace_id: "w2K",
				},
			},
		}),
		{ tabId: "w2K:t8", label: "3" },
	);
	assert.deepEqual(
		parseHerdrTabWindow({
			tab: { tab_id: "w2N:tS", number: 25, label: "dotfiles" },
		}),
		{ tabId: "w2N:tS", label: "dotfiles" },
	);
	assert.equal(parseHerdrTabWindow({ tab: { label: "3" } }), undefined);
	assert.equal(parseHerdrTabWindow(null), undefined);
});

test("builds herdr tab list and rename argv", () => {
	assert.deepEqual(buildLinearWindowListArgs("w2N"), ["tab", "list", "--workspace", "w2N"]);
	assert.deepEqual(buildLinearWindowRenameArgs("w2K:t8", "3: TRI-1234"), [
		"tab",
		"rename",
		"w2K:t8",
		"3: TRI-1234",
	]);
});
