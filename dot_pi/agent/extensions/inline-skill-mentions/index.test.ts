import assert from "node:assert/strict";
import test from "node:test";
import {
	buildInlineSkillContext,
	collectInlineSkillMentions,
	inlineSkillMentionQuery,
	listInlineSkillAutocompleteItems,
	mergeInlineSkillAutocompleteSuggestions,
	planInlineSkillMentionInput,
	queueUniqueInlineSkills,
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
	["knowledgebase", skill("knowledgebase")],
]);

test("strips known @mentions from the user prompt and does not inline skill bodies", () => {
	const collected = collectInlineSkillMentions(
		"i want you to transcribe this and put it in my @knowledgebase",
		skills,
	);
	assert.deepEqual(
		collected.skills.map((item) => item.name),
		["knowledgebase"],
	);
	assert.equal(collected.stripped, "i want you to transcribe this and put it in my");
	assert.doesNotMatch(collected.stripped, /@knowledgebase|<skill |knowledgebase body/);
});

test("collects multiple mentions in first-seen order and strips both", () => {
	const collected = collectInlineSkillMentions("grill this @grilling then @show-me", skills);
	assert.deepEqual(
		collected.skills.map((item) => item.name),
		["grilling", "show-me"],
	);
	assert.equal(collected.stripped, "grill this then");
});

test("dedupes repeated mentions", () => {
	const collected = collectInlineSkillMentions("@grilling and again @grilling", skills);
	assert.deepEqual(
		collected.skills.map((item) => item.name),
		["grilling"],
	);
	assert.equal(collected.stripped, "and again");
});

test("leaves emails, escapes, unknown names, and /skill:name alone", () => {
	const input = "user@grilling.com @@grilling /skill:grilling @nope";
	const collected = collectInlineSkillMentions(input, skills);
	assert.deepEqual(collected.skills, []);
	assert.equal(collected.stripped, input);
});

test("rewrites a leftover prompt to /skill:name so Pi expands the skill", () => {
	const plan = planInlineSkillMentionInput("transcribe this @knowledgebase", skills);
	assert.equal(plan.action, "transform");
	if (plan.action !== "transform") return;
	assert.equal(plan.text, "/skill:knowledgebase transcribe this");
	assert.deepEqual(plan.extraSkills, []);
});

test("rewrites a mention-only prompt to /skill:name so the agent still starts", () => {
	const plan = planInlineSkillMentionInput("@knowledgebase", skills);
	assert.equal(plan.action, "transform");
	if (plan.action !== "transform") return;
	assert.equal(plan.text, "/skill:knowledgebase");
	assert.deepEqual(plan.extraSkills, []);
});

test("keeps extra mentions for skill-context after the first /skill command", () => {
	const plan = planInlineSkillMentionInput("grill this @grilling then @show-me", skills);
	assert.equal(plan.action, "transform");
	if (plan.action !== "transform") return;
	assert.equal(plan.text, "/skill:grilling grill this then");
	assert.deepEqual(
		plan.extraSkills.map((item) => item.name),
		["show-me"],
	);
});

test("continues when the prompt has no known @skill mention", () => {
	assert.deepEqual(planInlineSkillMentionInput("just a question", skills), { action: "continue" });
});

test("builds a palette-style skill-context block", () => {
	const context = buildInlineSkillContext([skill("knowledgebase")]);
	assert.equal(
		context,
		`<skill name="knowledgebase" location="/skills/knowledgebase/SKILL.md">\nReferences are relative to /skills/knowledgebase.\n\nknowledgebase body\n</skill>`,
	);
});

test("wraps multiple skill-context blocks", () => {
	const context = buildInlineSkillContext([skill("grilling"), skill("show-me")]);
	assert.match(context, /^<skills count="2">/);
	assert.match(context, /<skill name="grilling"/);
	assert.match(context, /<skill name="show-me"/);
});

test("escapes skill attributes in the skill-context payload", () => {
	const context = buildInlineSkillContext([
		{
			name: "weird",
			filePath: `/skills/weird/SKILL.md?x="y"&z=<q>`,
			baseDir: "/skills/weird",
			body: "body",
		},
	]);
	assert.match(context, /location="\/skills\/weird\/SKILL.md\?x=&quot;y&quot;&amp;z=&lt;q&gt;"/);
});

test("queues unique skills in first-mention order", () => {
	const queued = queueUniqueInlineSkills([skill("grilling")], [skill("grilling"), skill("show-me")]);
	assert.deepEqual(
		queued.map((item) => item.name),
		["grilling", "show-me"],
	);
});

test("reads the @ query at the cursor", () => {
	assert.deepEqual(inlineSkillMentionQuery("please @gri"), { prefix: "@gri", query: "gri" });
	assert.deepEqual(inlineSkillMentionQuery("hello there @"), { prefix: "@", query: "" });
	assert.deepEqual(inlineSkillMentionQuery("hello there @Grill"), { prefix: "@Grill", query: "Grill" });
	assert.equal(inlineSkillMentionQuery("user@gri"), undefined);
	assert.equal(inlineSkillMentionQuery("hello there @src/"), undefined);
});

test("lists @skill autocomplete rows from command metadata without file paths", () => {
	const items = listInlineSkillAutocompleteItems("gri", [
		{ name: "skill:grilling", source: "skill", description: "Grill a plan" },
		{ name: "skill:knowledgebase", source: "skill" },
		{ name: "cd", source: "extension", description: "change directory" },
	]);
	assert.deepEqual(items, [{ value: "@grilling", label: "@grilling", description: "Grill a plan" }]);
});

test("puts skill autocomplete rows above file rows for the same @ token", () => {
	const merged = mergeInlineSkillAutocompleteSuggestions(
		"@",
		[{ value: "@grilling", label: "@grilling", description: "Grill a plan" }],
		{ prefix: "@", items: [{ value: "@README.md", label: "README.md" }] },
	);
	assert.deepEqual(merged, {
		prefix: "@",
		items: [
			{ value: "@grilling", label: "@grilling", description: "Grill a plan" },
			{ value: "@README.md", label: "README.md" },
		],
	});
});

test("keeps file rows when no skill name matches the @ query", () => {
	const files = { prefix: "@zz", items: [{ value: "@zz.txt", label: "zz.txt" }] };
	assert.deepEqual(mergeInlineSkillAutocompleteSuggestions("@zz", [], files), files);
});
