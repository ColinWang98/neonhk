import { normalizeNarratives } from "@/lib/narrative";
import { generateTextJson } from "@/lib/textModel";
import { spokenStoryStyle } from "@/lib/spokenStoryStyle";
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

const repairPrompt = `You edit a street-view story after the Story Judge found problems.

Keep the strongest existing thread, the selected persona's voice, and useful supported details. Fix the warned-about claim or passage, not the whole account by replacing it with a generic street scene.
If the original is mostly a place explanation or a list of actions, rebuild a connected account from the persona and the supplied place material. Do not simply add 'honestly' or another relative to the same explanation.

${spokenStoryStyle}

Evidence boundary:
- External facts about the selected fragment must come from NarrativeEvidenceView.primaryClaims.
- Preserve specific supported information rather than replacing it with 'a useful landmark' or route advice.
- Medium-confidence facts may be omitted or qualified briefly, without making all of the speaker's experiences hypothetical.
- optionalNearbyClaims are optional background. Omit a weak named claim that caused a warning instead of building the account around it.
- Do not describe forbiddenVisibleNames as visible, selected, or identical to the fragment.
- Do not make news or official notices explain the selected fragment.
- Fictional persona anecdotes are allowed, but not new place facts, exact menus or prices, historical events, private identities, or invented first-hand testimony about real news.
- Public review themes are subjective impressions. Do not turn a reviewer's account into the narrator's personal testimony.
- A coherent recollection or comparison need not contain an errand, a complication, or a final action.
- Do not read the evidence restrictions or judge's warnings aloud.

Return strict JSON: {"spokenStory": string}.
spokenStory remains the single source for subtitles. Do not return headings, separate cards, or an independently rewritten subtitle track.`;

export async function repairNarrativeWithTextModel(input: StoryRepairInput): Promise<SchemaNarratives> {
  const raw = await generateTextJson({
    temperature: 0.25,
    maxOutputTokens: 1600,
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
