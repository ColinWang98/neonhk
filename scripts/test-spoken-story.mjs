import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function loadModule(path, dependencies = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });
  return exports;
}

const style = await loadModule("lib/spokenStoryStyle.ts");
const requests = [];
let modelStory = "I used to think this campus wasn't for people like me. My work had nothing to do with a university. Then a conversation here changed that. We talked for ages about the things we'd learned at work, and the things we still wanted to try. That stayed with me longer than the building did.";
const model = {
  generateTextJson: async (request) => {
    requests.push(request);
    return JSON.stringify({ spokenStory: modelStory });
  }
};
const narrative = await loadModule("lib/narrative.ts", {
  "@/lib/textModel": model,
  "@/lib/spokenStoryStyle": style
});
const validation = await loadModule("lib/narrativeValidation.ts");
const factPlanner = await loadModule("lib/storyFactPlan.ts");
const repair = await loadModule("lib/agentGraph/storyRepair.ts", {
  "@/lib/textModel": model,
  "@/lib/spokenStoryStyle": style,
  "@/lib/narrative": narrative
});
const visualClaim = {
  id: "v1", text: "A campus entrance is visible.", source: "vision_model",
  claimType: "visual_observation", confidence: 0.95, visibilityStatus: "visible_confirmed",
  allowedUse: "direct_fact", uncertaintyCueRequired: false, privacySensitive: false,
  relatedSchemas: ["Functional-Use"]
};
const nearbyClaim = {
  ...visualClaim, id: "g1", text: "Lung Shing Dispensary is listed nearby.",
  source: "google_places", claimType: "nearby_candidate", allowedUse: "background_only",
  visibilityStatus: "nearby_not_confirmed_visible"
};
const packet = { claims: [visualClaim, nearbyClaim], fragment: {}, globalRules: [], blockedTopics: [] };
const evidenceView = {
  primaryClaims: [visualClaim], optionalNearbyClaims: [nearbyClaim],
  suppressedClaimIds: [], forbiddenVisibleNames: []
};
const plan = {
  narrativeMode: "full_interpretation", activeSchemas: ["Functional-Use"],
  sourceClaimIds: ["v1"], fitLevel: "high"
};
const persona = { id: "p1", role: "temporary resident", background: "An electrician staying nearby." };
const generated = await narrative.generateNarratives({}, {}, persona, undefined, packet, plan, evidenceView);
assert.equal(generated.spokenStory, modelStory);
assert.equal(generated.subtitleBlocks.map((block) => block.text).join(" "), modelStory);
const input = JSON.parse(requests[0].messages[1].content);
assert.equal(input.persona.background, persona.background);
assert(!("storyBrief" in input));
assert(requests[0].messages[0].content.includes(style.spokenStoryStyle));
assert(requests[0].messages[0].content.includes(style.personaExperienceRules));
assert(requests[0].messages[0].content.includes(style.spokenEditingRules));
const validate = (narratives, overrides = {}) => validation.validateNarrative({
  narratives, narrativeBlocks: narratives.subtitleBlocks, evidencePacket: packet, plan, ...overrides
});
assert.notEqual(validate(generated).status, "failed", "A recollection needs no forced errand or next action");
assert.equal(validate(generated, { plan: { ...plan, narrativeMode: "disabled" } }).status, "failed");
const forbiddenPacket = { ...packet, claims: [{ ...visualClaim, allowedUse: "do_not_use" }] };
assert.equal(validate(generated, { evidencePacket: forbiddenPacket }).status, "failed");
const visibleOverclaim = narrative.normalizeNarratives({ spokenStory: "This shop is Lung Shing Dispensary." }, evidenceView, plan);
assert.equal(validate(visibleOverclaim).status, "failed");
const nearbyMention = narrative.normalizeNarratives({ spokenStory: "There is a Lung Shing Dispensary nearby." }, evidenceView, plan);
assert.notEqual(validate(nearbyMention).status, "failed");

const longStory = Array.from({ length: 20 }, (_, index) =>
  `This is sentence ${index + 1} with enough words to occupy its own subtitle block without combining with the following sentence.`
).join(" ");
const longNarrative = narrative.normalizeNarratives({ spokenStory: longStory }, evidenceView, plan);
assert(longNarrative.subtitleBlocks.length > 8);
assert.equal(longNarrative.subtitleBlocks.map((block) => block.text).join(" "), longStory);

const fact = { ...visualClaim, id: "cv1", source: "candidate_verifier", text: '"Test Campus" includes a public design exhibition space.' };
const factPlan = factPlanner.buildStoryFactPlan(packet, { ...evidenceView, primaryClaims: [fact] });
assert.equal(factPlan.anchorFacts[0].text, fact.text, "Keep sourced detail, not an orientation recipe");
await repair.repairNarrativeWithTextModel({
  narratives: generated, narrativeBlocks: generated.subtitleBlocks,
  narrativeValidation: { warnings: ["Too explanatory"] }, evidencePacket: packet,
  narrativeEvidenceView: evidenceView, personaFragmentPlan: plan, persona
});
assert(requests.at(-1).messages[0].content.includes(style.spokenStoryStyle));
assert.equal(JSON.parse(requests.at(-1).messages[1].content).generatedStory.spokenStory, modelStory);
assert(requests.at(-1).messages[0].content.includes(style.personaExperienceRules));
assert(requests.at(-1).messages[0].content.includes(style.spokenEditingRules));
const judgeRequests = [];
const judge = await loadModule("lib/agentGraph/storyJudge.ts", {
  "@/lib/textModel": {
    textModelName: () => "test-model",
    generateTextJson: async (request) => {
      judgeRequests.push(request);
      return JSON.stringify({ status: "passed", warnings: [], requiresRegeneration: false });
    }
  },
  "@/lib/spokenStoryStyle": style
});
await judge.judgeNarrativeWithTextModel({ narratives: generated, narrativeBlocks: generated.subtitleBlocks,
  evidencePacket: packet, personaFragmentPlan: plan, persona, deterministicValidation: { status: "passed", warnings: [] } });
assert(judgeRequests[0].messages[0].content.includes(style.personaExperienceRules), "Judge must share the writer's distinction between role-play and invented visible relationships");
assert(judgeRequests[0].messages[0].content.includes(style.spokenEditingRules));
assert(judgeRequests[0].messages[0].content.includes("Supported area background need not be visible"));
const openingRequests = [];
const opening = await loadModule("lib/sceneOpening.ts", {
  "@/lib/textModel": { generateTextJson: async (request) => {
    openingRequests.push(request);
    return JSON.stringify({ openingBlocks: [
      { text: "I'm Mei Ling. I've lived around Tai Hang for twenty years.", groundedIn: ["persona_background", "pano_location"] },
      { text: "Around here, Mid-Autumn has that fire dragon tradition. It's one of the things I associate with this neighbourhood.", groundedIn: ["nearby_context"] }
    ] });
  } },
  "@/lib/spokenStoryStyle": style
});
const context = { places: [], locationKnowledge: [{ source: "hk_ich", title: "Tai Hang fire dragon dance" }] };
const result = await opening.generateSceneOpening({ image: { provider: "open3dhk", lat: 22.2782, lng: 114.192 }, persona, placeContext: context });
assert.equal(result.openingValidation.status, "passed");
assert(openingRequests[0].messages[0].content.includes(style.personaExperienceRules));
assert(openingRequests[0].messages[0].content.includes(style.spokenEditingRules));
assert(!openingRequests[0].messages[0].content.includes("Use plain actions: look left"));
assert(!JSON.parse(openingRequests[0].messages[1].content).languageStyle.includes("what detail to select next"));
assert.equal(JSON.parse(openingRequests[0].messages[1].content).placeContext.locationKnowledge[0].source, "hk_ich");
console.log("Spoken story preservation, full subtitle coverage, fact retention, shared repair style and evidence boundaries passed. No external API called.");
