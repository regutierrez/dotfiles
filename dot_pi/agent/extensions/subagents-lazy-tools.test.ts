import assert from "node:assert/strict";
import test from "node:test";
import {
	expandedSkillAskedForSubagents,
	sessionBranchUsedSubagentTools,
	userAskedForSubagents,
} from "./subagents-lazy-tools.ts";

test("matches an explicit subagent ask", () => {
	assert.equal(userAskedForSubagents("use a subagent to find auth files"), true);
	assert.equal(userAskedForSubagents("spawn an explore agent for this"), true);
	assert.equal(userAskedForSubagents("ask the oracle whether this design holds"), true);
	assert.equal(userAskedForSubagents("launch an agent to review the diff"), true);
	assert.equal(userAskedForSubagents("run a workflow over these files"), true);
	assert.equal(userAskedForSubagents("fan out reviewers on the diff"), true);
	assert.equal(userAskedForSubagents("call SubagentWorkflow for the audit"), true);
	assert.equal(userAskedForSubagents("/subagents"), true);
	assert.equal(userAskedForSubagents("/subagents now"), true);
	assert.equal(userAskedForSubagents("use @tintinweb/pi-subagents"), true);
});

test("does not match ordinary coding talk", () => {
	assert.equal(userAskedForSubagents("explore the repo for the bug"), false);
	assert.equal(userAskedForSubagents("the agent should edit APPEND_SYSTEM.md"), false);
	assert.equal(userAskedForSubagents("run the github workflow"), false);
	assert.equal(userAskedForSubagents("fix the coding agent prompt"), false);
	assert.equal(userAskedForSubagents("implement the feature"), false);
});

test("matches an expanded skill body that requires pi-subagents", () => {
	assert.equal(
		expandedSkillAskedForSubagents('<skill name="batch-rca" location="/x">Use @tintinweb/pi-subagents</skill>'),
		true,
	);
	assert.equal(expandedSkillAskedForSubagents('<skill name="grilling">Grill the plan</skill>'), false);
	assert.equal(expandedSkillAskedForSubagents("use a subagent"), false);
});

test("detects prior pi-subagents tool use in the session branch", () => {
	assert.equal(
		sessionBranchUsedSubagentTools([
			{ type: "message", message: { toolName: "Agent" } },
		]),
		true,
	);
	assert.equal(
		sessionBranchUsedSubagentTools([
			{
				type: "message",
				message: { content: [{ type: "toolCall", name: "SubagentWorkflow" }] },
			},
		]),
		true,
	);
	assert.equal(
		sessionBranchUsedSubagentTools([
			{ type: "message", message: { toolName: "read" } },
		]),
		false,
	);
});
