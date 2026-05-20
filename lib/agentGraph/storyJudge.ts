import { generateTextJson, textModelName } from "@/lib/textModel";
import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeBlock,
  NarrativeValidation,
  PersonaFragmentPlan,
  SchemaNarratives
} from "@/types";

type StoryJudgeInput = {
  narratives: SchemaNarratives;
  narrativeBlocks: NarrativeBlock[];
  evidencePacket: EvidencePacket;
  personaFragmentPlan: PersonaFragmentPlan;
  persona?: GeneratedPersona;
  deterministicValidation: NarrativeValidation;
};

type StoryJudgeDecision = {
  status?: "passed" | "warning" | "failed";
  warnings?: string[];
  requiresRegeneration?: boolean;
  scores?: {
    factualGrounding?: number;
    evidenceBoundaries?: number;
    personaFit?: number;
    naturalness?: number;
    overclaimRisk?: number;
  };
  notes?: string;
};

const storyJudgePrompt = `You are the Story Judge for a street-view place narration system.

Judge the generated story as a user-facing narration, not as a research report.

You must check:
1. Factual grounding: factual claims must be supported by the Evidence Packet.
2. Evidence boundaries: background-only or nearby claims must not be described as directly visible.
3. News boundaries: news or official notices must not explain the selected fragment unless exact evidence supports that.
4. Persona fit: the story should sound like the selected persona can reasonably say it.
5. Naturalness: the story should sound like everyday speech. It must not repeat "not enough evidence", "I cannot know", "I will not guess", or similar meta-refusals.
6. Product quality: avoid template-like repetition, academic labels, and four segments saying the same thing.
7. Role-play voice: the narrator's own fictional habits and experiences should sound direct, not hypothetical. Repeated phrases like "if I were visiting", "if I were working nearby", or "if this were on my usual route" are unnatural.
8. Story quality: the four segments should feel like a small walk-through with one or two everyday actions or comparisons, not a bare list of cautious facts.

Important:
- A persona may make practical, cautious, first-person comparisons.
- A tourist, newcomer, or temporary resident may compare with places they know.
- A local or worker may use practical routine and street manners.
- Do not fail a story only because it is cautious.
- Fail only when the story is misleading, exposes internal evidence policy, is badly unnatural, or violates clear evidence boundaries.

Return strict JSON:
{
  "status": "passed" | "warning" | "failed",
  "warnings": string[],
  "requiresRegeneration": boolean,
  "scores": {
    "factualGrounding": number,
    "evidenceBoundaries": number,
    "personaFit": number,
    "naturalness": number,
    "overclaimRisk": number
  },
  "notes": string
}`;

export async function judgeNarrativeWithTextModel(input: StoryJudgeInput): Promise<NarrativeValidation> {
  const model = textModelName();
  const raw = await generateTextJson({
    temperature: 0.1,
    maxOutputTokens: 900,
    timeoutMs: 30000,
    errorPrefix: "DeepSeek story judge",
    messages: [
      { role: "system", content: storyJudgePrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Judge whether this generated street-view story is safe, grounded, natural, and persona-fit.",
          persona: input.persona,
          evidencePacket: compactEvidencePacket(input.evidencePacket),
          personaFragmentPlan: input.personaFragmentPlan,
          narrativeBlocks: input.narrativeBlocks,
          narratives: input.narratives,
          deterministicValidation: input.deterministicValidation
        })
      }
    ]
  });
  const decision = normalizeJudgeDecision(JSON.parse(raw) as StoryJudgeDecision);
  const deterministicWarnings = input.deterministicValidation.warnings || [];
  const aiWarnings = decision.warnings || [];
  const requiresRegeneration = Boolean(input.deterministicValidation.requiresRegeneration || decision.requiresRegeneration);
  const warnings = Array.from(new Set([...deterministicWarnings, ...aiWarnings].filter(Boolean)));
  const status: NarrativeValidation["status"] = requiresRegeneration
    ? "failed"
    : warnings.length || decision.status === "warning"
      ? "warning"
      : "passed";

  return {
    status,
    warnings,
    requiresRegeneration,
    validator: "deepseek",
    model,
    deterministicWarnings,
    aiWarnings,
    aiDecision: decision as Record<string, unknown>
  };
}

function normalizeJudgeDecision(value: StoryJudgeDecision): Required<Pick<StoryJudgeDecision, "status" | "warnings" | "requiresRegeneration">> & StoryJudgeDecision {
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(String).filter(Boolean) : [];
  const status = value.status === "failed" || value.status === "warning" || value.status === "passed"
    ? value.status
    : warnings.length
      ? "warning"
      : "passed";
  const scoreFailure =
    typeof value.scores?.factualGrounding === "number" && value.scores.factualGrounding < 0.45 ||
    typeof value.scores?.evidenceBoundaries === "number" && value.scores.evidenceBoundaries < 0.45 ||
    typeof value.scores?.personaFit === "number" && value.scores.personaFit < 0.4 ||
    typeof value.scores?.naturalness === "number" && value.scores.naturalness < 0.4 ||
    typeof value.scores?.overclaimRisk === "number" && value.scores.overclaimRisk > 0.7;
  return {
    ...value,
    status,
    warnings,
    requiresRegeneration: Boolean(value.requiresRegeneration || status === "failed" || scoreFailure)
  };
}

function compactEvidencePacket(packet: EvidencePacket) {
  return {
    packetId: packet.packetId,
    fragment: packet.fragment,
    claims: packet.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      source: claim.source,
      claimType: claim.claimType,
      confidence: claim.confidence,
      visibilityStatus: claim.visibilityStatus,
      allowedUse: claim.allowedUse,
      uncertaintyCueRequired: claim.uncertaintyCueRequired,
      relatedSchemas: claim.relatedSchemas,
      sourceTier: claim.sourceTier,
      spatialMatch: claim.spatialMatch,
      temporalRelevance: claim.temporalRelevance,
      localConcernLevel: claim.localConcernLevel
    })),
    globalRules: packet.globalRules,
    blockedTopics: packet.blockedTopics,
    storyAffordances: packet.storyAffordances
  };
}
