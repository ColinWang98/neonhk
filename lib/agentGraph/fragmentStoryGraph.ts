import { logAgentRun } from "@/lib/agentRuns";
import { verifyCandidateMatches } from "@/lib/candidateVerification";
import { buildEvidencePacket } from "@/lib/evidence";
import { geminiDiagnostics } from "@/lib/gemini";
import { generateNarratives } from "@/lib/narrative";
import { buildNarrativeBlocks, buildSafeNarratives, reinforceConcreteFacts, validateNarrative } from "@/lib/narrativeValidation";
import { buildNarrativeEvidenceView } from "@/lib/narrativeEvidenceView";
import { buildPersonaFragmentPlan } from "@/lib/personaFragment";
import { judgeNarrativeWithGemini } from "@/lib/agentGraph/storyJudge";
import { repairNarrativeWithGemini } from "@/lib/agentGraph/storyRepair";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type {
  AgentRunSummary,
  EvidencePacket,
  GeneratedPersona,
  NarrativeBlock,
  NarrativeValidation,
  PanoramaPov,
  PersonaFragmentPlan,
  PlaceContext,
  SchemaNarratives,
  StreetImage,
  VisionDescription
} from "@/types";

type FragmentStoryGraphInput = {
  fragmentId: string;
  sessionId?: string;
  visionDescription: VisionDescription;
  persona?: GeneratedPersona;
  placeContext?: PlaceContext;
  image?: StreetImage;
  cropImageUrl?: string;
  panoramaPov?: PanoramaPov;
  existingEvidencePacket?: EvidencePacket;
  config?: RuntimeApiConfig;
  skipAiJudge?: boolean;
  skipAgentLogs?: boolean;
};

type FragmentStoryGraphOutput = {
  narratives: SchemaNarratives;
  evidencePacket: EvidencePacket;
  personaFragmentPlan: PersonaFragmentPlan;
  narrativeBlocks: NarrativeBlock[];
  narrativeValidation: NarrativeValidation;
  agentRuns: AgentRunSummary[];
  repaired: boolean;
};

const graphName = "fragment_story_graph";

export async function runFragmentStoryGraph(input: FragmentStoryGraphInput): Promise<FragmentStoryGraphOutput> {
  const config = input.config || {};
  const diagnostics = geminiDiagnostics();
  const runContext = {
    sessionId: input.sessionId,
    fragmentId: input.fragmentId,
    personaId: input.persona?.id,
    skipLogs: input.skipAgentLogs
  };
  const agentRuns: AgentRunSummary[] = [];

  const candidateVerification = await runAgent(
    "CandidateVerifierAgent",
    {
      cropImageAttached: Boolean(input.cropImageUrl),
      panoId: input.image?.panoId || input.image?.id,
      hasPlaceContext: Boolean(input.placeContext),
      existingEvidencePacket: Boolean(input.existingEvidencePacket)
    },
    async () =>
      input.existingEvidencePacket?.candidateVerification ||
      verifyCandidateMatches({
        cropImageUrl: input.cropImageUrl,
        image: input.image,
        panoramaPov: input.panoramaPov,
        visionDescription: input.visionDescription,
        placeContext: input.placeContext,
        config
      }),
    {
      ...runContext,
      config,
      agentRuns,
      provider: diagnostics.provider,
      model: diagnostics.model
    }
  );

  const evidencePacket = await runAgent(
    "EvidencePacketAgent",
    {
      candidateCount: candidateVerification?.matches?.length || 0,
      existingEvidencePacket: Boolean(input.existingEvidencePacket)
    },
    async () =>
      buildEvidencePacket({
        fragmentId: input.fragmentId,
        sessionId: input.sessionId,
        image: input.image,
        cropImageUrl: input.cropImageUrl,
        visionDescription: input.visionDescription,
        placeContext: input.placeContext,
        panoramaPov: input.panoramaPov,
        candidateVerification
      }),
    {
      ...runContext,
      config,
      agentRuns,
      provider: "system",
      model: "evidence-v1"
    }
  );

  const personaFragmentPlan = await runAgent(
    "PersonaAdaptAgent",
    {
      personaId: input.persona?.id,
      claimCount: evidencePacket.claims.length,
      affordances: evidencePacket.fragment.fragmentCategory
    },
    async () =>
      buildPersonaFragmentPlan({
        fragmentId: input.fragmentId,
        persona: input.persona,
        visionDescription: input.visionDescription,
        evidencePacket
      }),
    {
      ...runContext,
      config,
      agentRuns,
      provider: "system",
      model: "persona-fragment-v1"
    }
  );

  let narrativeEvidenceView = await runAgent(
    "NarrativeEvidenceViewAgent",
    {
      claimCount: evidencePacket.claims.length,
      mode: "initial"
    },
    async () => buildNarrativeEvidenceView(evidencePacket),
    {
      ...runContext,
      config,
      agentRuns,
      provider: "system",
      model: "narrative-evidence-view-v1"
    }
  );

  const generatedNarratives = await runAgent(
    "StoryWriterAgent",
    {
      personaId: input.persona?.id,
      claimCount: evidencePacket.claims.length,
      activeSchemas: personaFragmentPlan.activeSchemas
    },
    async () =>
      generateNarratives(
        input.visionDescription,
        config,
        input.persona,
        input.placeContext,
        evidencePacket,
        personaFragmentPlan,
        narrativeEvidenceView,
        {
          cropImageUrl: input.cropImageUrl,
          image: input.image
        }
      ),
    {
      ...runContext,
      config,
      agentRuns,
      provider: diagnostics.provider,
      model: diagnostics.model
    }
  );

  let narratives = await runAgent(
    "FactReinforcementAgent",
    {
      claimCount: evidencePacket.claims.length
    },
    async () => reinforceConcreteFacts(generatedNarratives, evidencePacket, narrativeEvidenceView),
    {
      ...runContext,
      config,
      agentRuns,
      provider: "system",
      model: "fact-reinforcement-v1"
    }
  );

  let narrativeBlocks = buildNarrativeBlocks(narratives, evidencePacket, personaFragmentPlan, narrativeEvidenceView);
  let deterministicValidation = validateNarrative({
    narratives,
    narrativeBlocks,
    evidencePacket,
    plan: personaFragmentPlan
  });
  let narrativeValidation = input.skipAiJudge
    ? await runAgent(
        "SystemStoryJudgeAgent",
        {
          deterministicValidation,
          narrativeBlocks
        },
        async () => ({
          ...deterministicValidation,
          validator: "system" as const,
          deterministicWarnings: deterministicValidation.warnings,
          aiWarnings: []
        }),
        {
          ...runContext,
          config,
          agentRuns,
          provider: "system",
          model: "deterministic-validation-v1"
        }
      )
    : await runAgent(
        "StoryJudgeAgent",
        {
          deterministicValidation,
          narrativeBlocks
        },
        async () =>
          judgeNarrativeWithGemini({
            narratives,
            narrativeBlocks,
            evidencePacket,
            personaFragmentPlan,
            persona: input.persona,
            deterministicValidation
          }),
        {
          ...runContext,
          config,
          agentRuns,
          provider: diagnostics.provider,
          model: diagnostics.model
        }
      );

  let repaired = false;
  if (!input.skipAiJudge && narrativeValidation.requiresRegeneration) {
    repaired = true;
    narrativeEvidenceView = await runAgent(
      "NarrativeEvidenceDemotionAgent",
      {
        warnings: narrativeValidation.warnings,
        mode: "repair"
      },
      async () => buildNarrativeEvidenceView(evidencePacket, { warnings: narrativeValidation.warnings }),
      {
        ...runContext,
        config,
        agentRuns,
        provider: "system",
        model: "narrative-evidence-view-v1"
      }
    );
    narratives = await runAgent(
      "StoryRepairAgent",
      {
        warnings: narrativeValidation.warnings,
        aiDecision: narrativeValidation.aiDecision
      },
      async () =>
        repairNarrativeWithGemini({
          narratives,
          narrativeBlocks,
          narrativeValidation,
          evidencePacket,
          narrativeEvidenceView,
          personaFragmentPlan,
          persona: input.persona
        }),
      {
        ...runContext,
        config,
        agentRuns,
        provider: diagnostics.provider,
        model: diagnostics.model
      }
    );
    narratives = reinforceConcreteFacts(narratives, evidencePacket, narrativeEvidenceView);
    narrativeBlocks = buildNarrativeBlocks(narratives, evidencePacket, personaFragmentPlan, narrativeEvidenceView);
    deterministicValidation = validateNarrative({
      narratives,
      narrativeBlocks,
      evidencePacket,
      plan: personaFragmentPlan
    });
    narrativeValidation = await runAgent(
      "StoryJudgeAgentAfterRepair",
      {
        deterministicValidation,
        narrativeBlocks
      },
      async () =>
        judgeNarrativeWithGemini({
          narratives,
          narrativeBlocks,
          evidencePacket,
          personaFragmentPlan,
          persona: input.persona,
          deterministicValidation
        }),
      {
        ...runContext,
        config,
        agentRuns,
        provider: diagnostics.provider,
        model: diagnostics.model
      }
    );
  }

  if (narrativeValidation.requiresRegeneration) {
    repaired = true;
    narrativeEvidenceView = await runAgent(
      "SafeEvidenceViewAgent",
      {
        warnings: narrativeValidation.warnings,
        mode: "safe"
      },
      async () => buildNarrativeEvidenceView(evidencePacket, { warnings: narrativeValidation.warnings, safeMode: true }),
      {
        ...runContext,
        config,
        agentRuns,
        provider: "system",
        model: "narrative-evidence-view-v1"
      }
    );
    narratives = await runAgent(
      "SafeNarrationAgent",
      {
        warnings: narrativeValidation.warnings,
        primaryClaimCount: narrativeEvidenceView.primaryClaims.length
      },
      async () =>
        buildSafeNarratives({
          evidencePacket,
          evidenceView: narrativeEvidenceView,
          personaRole: input.persona?.role
        }),
      {
        ...runContext,
        config,
        agentRuns,
        provider: "system",
        model: "safe-narration-v1"
      }
    );
    narrativeBlocks = buildNarrativeBlocks(narratives, evidencePacket, personaFragmentPlan, narrativeEvidenceView);
    deterministicValidation = validateNarrative({
      narratives,
      narrativeBlocks,
      evidencePacket,
      plan: personaFragmentPlan
    });
    narrativeValidation = {
      ...deterministicValidation,
      status: deterministicValidation.requiresRegeneration ? "warning" : deterministicValidation.status,
      requiresRegeneration: false,
      validator: "system",
      deterministicWarnings: deterministicValidation.warnings,
      aiWarnings: narrativeValidation.aiWarnings || [],
      aiDecision: {
        previousFailure: narrativeValidation.aiDecision,
        safeNarrationApplied: true
      }
    };
  }

  return {
    narratives,
    evidencePacket,
    personaFragmentPlan,
    narrativeBlocks,
    narrativeValidation,
    agentRuns,
    repaired
  };
}

async function runAgent<T>(
  agentName: string,
  inputSummary: unknown,
  task: () => Promise<T> | T,
  context: {
    sessionId?: string;
    fragmentId?: string;
    personaId?: string;
    config: RuntimeApiConfig;
    agentRuns: AgentRunSummary[];
    provider?: string;
    model?: string;
    skipLogs?: boolean;
  }
): Promise<T> {
  const runId = `${agentName}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const startedAt = performance.now();
  try {
    const output = await task();
    if (context.skipLogs) {
      context.agentRuns.push({
        runId,
        agentName,
        status: "succeeded",
        durationMs: Math.round(performance.now() - startedAt)
      });
      return output;
    }
    const summary = await logAgentRun(
      {
        runId,
        graphName,
        agentName,
        sessionId: context.sessionId,
        fragmentId: context.fragmentId,
        personaId: context.personaId,
        provider: context.provider,
        model: context.model,
        status: "succeeded",
        input: inputSummary,
        output: summarizeOutput(output),
        durationMs: Math.round(performance.now() - startedAt)
      },
      context.config
    );
    context.agentRuns.push(summary);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${agentName} failed.`;
    if (context.skipLogs) {
      context.agentRuns.push({
        runId,
        agentName,
        status: "failed",
        errorMessage: message,
        durationMs: Math.round(performance.now() - startedAt)
      });
      throw error;
    }
    const summary = await logAgentRun(
      {
        runId,
        graphName,
        agentName,
        sessionId: context.sessionId,
        fragmentId: context.fragmentId,
        personaId: context.personaId,
        provider: context.provider,
        model: context.model,
        status: "failed",
        input: inputSummary,
        errorMessage: message,
        durationMs: Math.round(performance.now() - startedAt)
      },
      context.config
    );
    context.agentRuns.push(summary);
    throw error;
  }
}

function summarizeOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return { type: "array", count: value.length };
  const record = value as Record<string, unknown>;
  if ("claims" in record && Array.isArray(record.claims)) {
    return { type: "evidence_packet", claimCount: record.claims.length, packetId: record.packetId };
  }
  if ("activeSchemas" in record) {
    return {
      type: "persona_fragment_plan",
      fitLevel: record.fitLevel,
      narrativeMode: record.narrativeMode,
      activeSchemas: record.activeSchemas
    };
  }
  if ("functionalUse" in record && "identityBelonging" in record) {
    return { type: "schema_narratives" };
  }
  if ("status" in record && "warnings" in record) {
    return record;
  }
  return record;
}
