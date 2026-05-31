import { normalizeNarratives } from "@/lib/narrative";
import { generateTextJson } from "@/lib/textModel";
import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeBlock,
  NarrativeEvidenceView,
  NarrativeValidation,
  PersonaFragmentPlan,
  SchemaNarratives
} from "@/types";

type StoryRepairInput = {
  narratives: SchemaNarratives;
  narrativeBlocks: NarrativeBlock[];
  narrativeValidation: NarrativeValidation;
  evidencePacket: EvidencePacket;
  narrativeEvidenceView: NarrativeEvidenceView;
  personaFragmentPlan: PersonaFragmentPlan;
  persona?: GeneratedPersona;
};

const repairPrompt = `You repair a generated street-view story after a Story Judge found problems.

Repair goals:
1. Keep useful concrete facts and persona perspective.
2. Remove misleading claims, meta-refusals, and overstatements.
3. If evidence is weak, use smaller grounded observations and practical persona judgement.
4. Do not say "not enough evidence", "I cannot know", "I will not guess", or similar policy language.
5. Keep it natural, spoken, and first-person.
6. Convert the story into one continuous monologue, not checklist answers or separate cards.
7. Return only spokenStory. It is the source of truth for subtitles and internal fields.
8. Direct and high-confidence facts are anchors. Medium-confidence facts are optional. Keep only the ones that make the story sound more specific and natural.

Persona style:
- Do not label the persona in the sentence. Never write "as a temporary-resident", "as a tourist", or "as a local resident".
- Use the persona's role, userIntro, background, and voiceHint as speaking texture: route-finding, working nearby, local errands, short-term learning, travel comparison, age, pace, food, rain, queues, or transport habits.
- Treat the persona as an active fictional role-play speaker. Their own habits and experiences can be direct: "I usually...", "I learned...", "after staying here...", "when I visit...", "on my usual route...".
- Avoid role-play hypotheticals such as "if I were visiting", "if I were working nearby", and "if this were on my usual route".
- Use direct action more than conditional language: "I slow down", "I use the sign", "I step aside", "I learned this after a few weeks here". Use "I would" only when the action is genuinely conditional.
- Add one tiny everyday scene when possible: checking a sign, arriving from transport, holding a drink, keeping out of a doorway, leaving space for a delivery, waiting in rain, or comparing the place with a street near home.
- Add one small personal or social connection when it fits: a cousin at school, a friend talking about food, a family errand, a worker's delivery route, a regular queue, a wet pavement habit, or a place to wait.
- This applies to any place type, not just famous buildings. Campuses, shops, clinics, estates, stations, markets, office blocks, footbridges, and plain frontages can all carry a small human errand or relationship.
- Make the scene have a reason: the narrator is a little early, late, hungry, carrying something, meeting someone, avoiding rain, comparing it with another city, or checking a message.
- Do not repair the story into pure route advice. Keep one thing the narrator cares about personally, even if the place fact is only medium confidence.
- Follow a tiny spoken arc: visible clue, personal connection, one local-life detail, then a small next action.
- At most one sentence can be about orientation, standing aside, or following the crowd. The rest should be about a person, errand, taste, class, work shift, payment, queue, rain, or waiting.
- Add light spoken turns when natural: "okay, so", "I mean", "honestly", "the thing is", "that is the bit I look for". Do not overuse one phrase.
- Turn uncertainty into practical street judgement. Do not expose evidence mechanics.
- Do not add headings like "What catches my eye", "A time of day", "How people move here", "Everyday use", or "Shared space".
- Avoid abstract or formal phrases such as "identity", "rhythm", "social meaning", "urban texture", "public-facing environment", and "spatial context".
- The system will derive subtitles from spokenStory, so never write cards, headings, or separate answers.

Do not add new factual claims beyond NarrativeEvidenceView.primaryClaims.
NarrativeEvidenceView.optionalNearbyClaims are optional nearby context only. Omit them if they caused a warning.
Medium-confidence primaryClaims are also optional for style. Omit them if they make the repaired story sound like a list.
Do not turn nearby/background-only claims into directly visible facts.
Do not mention forbiddenVisibleNames as visible, selected, or identical to the fragment.
Do not make news or official notices explain the selected fragment.
Avoid stiff evidence phrases such as "the map and image make", "possible match here", "visual-map verifier", "candidate", "keep the reading modest", "frontage has a simple identity", and "without pretending I know the whole place".
Avoid generic filler such as "I use it first for orientation", "edge of the flow", "one sign, one corner", "stop feeling lost", "keep the passage open", and "the daily rhythm is the part I trust".

Return strict JSON:
{
  "spokenStory": string
}`;

export async function repairNarrativeWithTextModel(input: StoryRepairInput): Promise<SchemaNarratives> {
  const raw = await generateTextJson({
    temperature: 0.25,
    maxOutputTokens: 1200,
    timeoutMs: 40000,
    errorPrefix: "DeepSeek story repair",
    messages: [
      { role: "system", content: repairPrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Repair this story so it passes the judge while remaining natural and persona-specific.",
          persona: input.persona,
          narrativeEvidenceView: input.narrativeEvidenceView,
          evidencePacketForReferenceOnly: {
            fragment: input.evidencePacket.fragment,
            globalRules: input.evidencePacket.globalRules,
            blockedTopics: input.evidencePacket.blockedTopics
          },
          personaFragmentPlan: input.personaFragmentPlan,
          judgeWarnings: input.narrativeValidation.warnings,
          judgeDecision: input.narrativeValidation.aiDecision,
          generatedStory: compactGeneratedStory(input.narratives, input.narrativeBlocks)
        })
      }
    ]
  });

  return normalizeNarratives(JSON.parse(raw) as unknown, input.narrativeEvidenceView, input.personaFragmentPlan);
}

function compactGeneratedStory(narratives: SchemaNarratives, narrativeBlocks: NarrativeBlock[]) {
  return {
    spokenStory: primaryNarrativeText(narratives),
    grounding: narrativeBlocks.map((block) => ({
      schema: block.schema,
      claimType: block.claimType,
      groundedIn: block.groundedIn,
      confidence: block.confidence
    }))
  };
}

function primaryNarrativeText(narratives: SchemaNarratives) {
  if (narratives.spokenStory?.trim()) return narratives.spokenStory.trim();
  const blockText = (narratives.subtitleBlocks || narratives.storyBeats)?.map((block) => block.text).join(" ") || "";
  if (blockText.trim()) return blockText.trim();
  return [
    narratives.functionalUse.text,
    narratives.identityBelonging.text,
    narratives.memoryTemporality.text,
    narratives.socialCulturalResonance.text
  ].join(" ").trim();
}
