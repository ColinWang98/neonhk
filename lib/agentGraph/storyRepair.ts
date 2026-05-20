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
6. Make the four segments feel like one small walk-through, not four checklist answers.
7. Return the same four segment JSON shape.

Persona style:
- Do not label the persona in the sentence. Never write "as a temporary-resident", "as a tourist", or "as a local resident".
- Use the persona's role, userIntro, background, and voiceHint as speaking texture: route-finding, working nearby, local errands, short-term learning, travel comparison, age, pace, food, rain, queues, or transport habits.
- Treat the persona as an active fictional role-play speaker. Their own habits and experiences can be direct: "I usually...", "I learned...", "after staying here...", "when I visit...", "on my usual route...".
- Avoid role-play hypotheticals such as "if I were visiting", "if I were working nearby", and "if this were on my usual route".
- Use direct action more than conditional language: "I slow down", "I use the sign", "I step aside", "I learned this after a few weeks here". Use "I would" only when the action is genuinely conditional.
- Add one tiny everyday scene when possible: checking a sign, arriving from transport, holding a drink, keeping out of a doorway, leaving space for a delivery, waiting in rain, or comparing the place with a street near home.
- Turn uncertainty into practical street judgement. Do not expose evidence mechanics.

Do not add new factual claims beyond NarrativeEvidenceView.primaryClaims.
NarrativeEvidenceView.optionalNearbyClaims are optional nearby context only. Omit them if they caused a warning.
Do not turn nearby/background-only claims into directly visible facts.
Do not mention forbiddenVisibleNames as visible, selected, or identical to the fragment.
Do not make news or official notices explain the selected fragment.
Avoid stiff evidence phrases such as "the map and image make", "possible match here", "visual-map verifier", "candidate", "keep the reading modest", "frontage has a simple identity", and "without pretending I know the whole place".

Return strict JSON:
{
  "functionalUse": {"title": "Functional-Use", "text": string},
  "identityBelonging": {"title": "Identity-Belonging", "text": string},
  "memoryTemporality": {"title": "Memory-Temporality", "text": string},
  "socialCulturalResonance": {"title": "Social-Cultural Resonance", "text": string}
}`;

export async function repairNarrativeWithTextModel(input: StoryRepairInput): Promise<SchemaNarratives> {
  const raw = await generateTextJson({
    temperature: 0.25,
    maxOutputTokens: 3200,
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
          narrativeBlocks: input.narrativeBlocks,
          narratives: input.narratives
        })
      }
    ]
  });

  return normalizeNarratives(JSON.parse(raw) as unknown);
}
