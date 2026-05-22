import { NextRequest, NextResponse } from "next/server";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { runFragmentStoryGraph } from "@/lib/agentGraph/fragmentStoryGraph";
import { persistFragment } from "@/lib/fragments";
import { logEvent } from "@/lib/logger";
import { narrativeCacheVersion } from "@/lib/narrativeCache";
import { rememberEvidencePacket } from "@/lib/placeMemory";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { textModelDiagnostics } from "@/lib/textModel";
import type {
  GeneratedPersona,
  EvidencePacket,
  NarrativeGeneration,
  PanoramaPov,
  PersonaFragmentPlan,
  PlaceContext,
  StreetImage,
  VisionDescription
} from "@/types";

type NarrativeRequest = {
  fragmentId: string;
  sessionId?: string;
  visionDescription: VisionDescription;
  persona?: GeneratedPersona;
  placeContext?: PlaceContext;
  image?: StreetImage;
  cropImageUrl?: string;
  panoramaPov?: PanoramaPov;
  existingNarrativeGenerations?: Record<string, NarrativeGeneration>;
  existingPersonaFragmentPlans?: Record<string, PersonaFragmentPlan>;
  existingEvidencePacket?: EvidencePacket;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NarrativeRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.fragmentId || !body.visionDescription) {
      return NextResponse.json({ error: "fragmentId and visionDescription are required." }, { status: 400 });
    }

    const startedAt = performance.now();
    const narrativeDiagnostics = textModelDiagnostics();
    const graphResult = await runFragmentStoryGraph({
      fragmentId: body.fragmentId,
      sessionId: body.sessionId,
      visionDescription: body.visionDescription,
      persona: body.persona,
      placeContext: body.placeContext,
      image: body.image,
      cropImageUrl: body.cropImageUrl,
      panoramaPov: body.panoramaPov,
      existingEvidencePacket: body.existingEvidencePacket,
      config
    });
    const {
      narratives,
      evidencePacket,
      personaFragmentPlan,
      narrativeBlocks,
      narrativeValidation,
      agentRuns,
      repaired
    } = graphResult;
    const personaId = body.persona?.id || "default";
    const narrativeGeneration: NarrativeGeneration = {
      personaId,
      version: narrativeCacheVersion,
      narratives,
      evidencePacket,
      personaFragmentPlan,
      narrativeBlocks,
      narrativeValidation,
      agentRuns,
      createdAt: new Date().toISOString()
    };
    const narrativeGenerations = {
      ...(body.existingNarrativeGenerations || {}),
      [personaId]: narrativeGeneration
    };
    await logAiGeneration(
      {
        sessionId: body.sessionId,
        fragmentId: body.fragmentId,
        stage: "narrative_generation",
        provider: narrativeDiagnostics.provider,
        model: narrativeDiagnostics.model,
        status: "success",
          inputSummary: {
            visionDescription: body.visionDescription,
            personaId: body.persona?.id,
            evidenceClaimCount: evidencePacket.claims.length,
            candidateVerification: evidencePacket.candidateVerification,
            personaFragmentPlan,
            agentGraph: "fragment_story_graph"
          },
        output: { narratives, narrativeBlocks, narrativeValidation, agentRuns, repaired },
        durationMs: Math.round(performance.now() - startedAt)
      },
      config
    );
    await persistFragment({
      id: body.fragmentId,
      visionDescription: body.visionDescription,
      narratives,
      narrativePersonaId: body.persona?.id,
      placeContext: body.placeContext,
      evidencePacket,
      personaFragmentPlans: {
        ...(body.existingPersonaFragmentPlans || {}),
        [personaId]: personaFragmentPlan
      },
      narrativeGenerations,
      narrativeBlocks,
      narrativeValidation,
      status: "ready"
    }, config);
    await rememberEvidencePacket({
      sessionId: body.sessionId,
      fragmentId: body.fragmentId,
      evidencePacket,
      config
    }).catch((error) => {
      console.warn("[place.memory] remember_after_narrative_failed", {
        fragmentId: body.fragmentId,
        message: error instanceof Error ? error.message : String(error)
      });
    });
    await logEvent(
      {
        eventType: "narratives_generated",
        payload: {
          fragmentId: body.fragmentId,
          narratives,
          narrativeValidation,
          agentRuns,
          repaired
        }
      },
      config
    );

    return NextResponse.json({
      ...narratives,
      narrativeBlocks,
      evidencePacket,
      personaFragmentPlan,
      narrativeGeneration,
      narrativeGenerations,
      narrativeValidation,
      agentRuns,
      repaired
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Narrative generation failed." },
      { status: 500 }
    );
  }
}
