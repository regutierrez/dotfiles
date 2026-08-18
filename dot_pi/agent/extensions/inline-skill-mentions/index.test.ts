import assert from "node:assert/strict";
import test from "node:test";
import {
	expandInlineSkillMentions,
	inlineSkillMentionQuery,
	type InlineSkill,
} from "./index.ts";

function skill(name: string): InlineSkill {
	return {
		name,
		filePath: `/skills/${name}/SKILL.md`,
		baseDir: `/skills/${name}`,
		body: `${name} body`,
	};
}

const skills = new Map<string, InlineSkill>([
	["grilling", skill("grilling")],
	["show-me", skill("show-me")],
]);

test("expands known @mentions in place", () => {
	const text = expandInlineSkillMentions("grill this @grilling then @show-me", skills);
	assert.match(text, /grill this <skill name="grilling"/);
	assert.match(text, /then <skill name="show-me"/);
	assert.doesNotMatch(text, /@grilling|@show-me/);
});

test("leaves emails, escapes, unknown names, and /skill:name alone", () => {
	const input = "user@grilling.com @@grilling /skill:grilling @nope";
	assert.equal(expandInlineSkillMentions(input, skills), input);
});

test("reads the @ query at the cursor", () => {
	assert.deepEqual(inlineSkillMentionQuery("please @gri"), { prefix: "@gri", query: "gri" });
	assert.equal(inlineSkillMentionQuery("user@gri"), undefined);
});
