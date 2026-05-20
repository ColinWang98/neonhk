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
6. Return the same four segment JSON shape.

Do not add new factual claims beyond NarrativeEvidenceView.primaryClaims.
NarrativeEvidenceView.optionalNearbyClaims are optional nearby context only. Omit them if they caused a warning.
Do not turn nearby/background-only claims into directly visible facts.
Do not mention forbiddenVisibleNames as visible, selected, or identical to the fragment.
Do not make news or official notices explain the selected fragment.

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
