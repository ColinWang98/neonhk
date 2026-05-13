import { NextRequest, NextResponse } from "next/server";
import { getAiProviderDiagnostics } from "@/lib/aiProvider";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { buildEvidencePacket } from "@/lib/evidence";
import { persistFragment } from "@/lib/fragments";
import { logEvent } from "@/lib/logger";
import { generateNarratives } from "@/lib/narrative";
import { buildNarrativeBlocks, validateNarrative } from "@/lib/narrativeValidation";
import { buildPersonaFragmentPlan } from "@/lib/personaFragment";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { GeneratedPersona, PanoramaPov, PlaceContext, StreetImage, VisionDescription } from "@/types";

type NarrativeRequest = {
  fragmentId: string;
  sessionId?: string;
  visionDescription: VisionDescription;
  persona?: GeneratedPersona;
  placeContext?: PlaceContext;
  image?: StreetImage;
  cropImageUrl?: string;
  panoramaPov?: PanoramaPov;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NarrativeRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.fragmentId || !body.visionDescription) {
      return NextResponse.json({ error: "fragmentId and visionDescription are required." }, { status: 400 });
    }

    const startedAt = performance.now();
    const aiDiagnostics = getAiProviderDiagnostics(config);
    const evidencePacket = buildEvidencePacket({
      fragmentId: body.fragmentId,
      sessionId: body.sessionId,
      image: body.image,
      cropImageUrl: body.cropImageUrl,
      visionDescription: body.visionDescription,
      placeContext: body.placeContext,
      panoramaPov: body.panoramaPov
    });
    const personaFragmentPlan = buildPersonaFragmentPlan({
      fragmentId: body.fragmentId,
      persona: body.persona,
      visionDescription: body.visionDescription,
      evidencePacket
    });
    const narratives = await generateNarratives(
      body.visionDescription,
      config,
      body.persona,
      body.placeContext,
      evidencePacket,
      personaFragmentPlan
    );
    const narrativeBlocks = buildNarrativeBlocks(narratives, evidencePacket, personaFragmentPlan);
    const narrativeValidation = validateNarrative({
      narratives,
      narrativeBlocks,
      evidencePacket,
      plan: personaFragmentPlan
    });
    await logAiGeneration(
      {
        sessionId: body.sessionId,
        fragmentId: body.fragmentId,
        stage: "narrative_generation",
        provider: aiDiagnostics.text.provider,
        model: aiDiagnostics.text.model,
        status: "success",
        inputSummary: {
          visionDescription: body.visionDescription,
          personaId: body.persona?.id,
          evidenceClaimCount: evidencePacket.claims.length,
          personaFragmentPlan
        },
        output: { narratives, narrativeBlocks, narrativeValidation },
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
        [body.persona?.id || "default"]: personaFragmentPlan
      },
      narrativeBlocks,
      narrativeValidation,
      status: "ready"
    }, config);
    await logEvent(
      {
        eventType: "narratives_generated",
        payload: {
          fragmentId: body.fragmentId,
          narratives,
          narrativeValidation
        }
      },
      config
    );

    return NextResponse.json({
      ...narratives,
      narrativeBlocks,
      evidencePacket,
      personaFragmentPlan,
      narrativeValidation
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Narrative generation failed." },
      { status: 500 }
    );
  }
}
