import { NextRequest, NextResponse } from "next/server";
import { getAiProviderDiagnostics } from "@/lib/aiProvider";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { persistFragment } from "@/lib/fragments";
import { logEvent } from "@/lib/logger";
import { generateNarratives } from "@/lib/narrative";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { GeneratedPersona, PlaceContext, VisionDescription } from "@/types";

type NarrativeRequest = {
  fragmentId: string;
  sessionId?: string;
  visionDescription: VisionDescription;
  persona?: GeneratedPersona;
  placeContext?: PlaceContext;
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
    const narratives = await generateNarratives(body.visionDescription, config, body.persona, body.placeContext);
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
          placeContext: body.placeContext
        },
        output: narratives,
        durationMs: Math.round(performance.now() - startedAt)
      },
      config
    );
    await persistFragment({
      id: body.fragmentId,
      visionDescription: body.visionDescription,
      narratives,
      status: "ready"
    }, config);
    await logEvent(
      {
        eventType: "narratives_generated",
        payload: {
          fragmentId: body.fragmentId,
          narratives
        }
      },
      config
    );

    return NextResponse.json(narratives);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Narrative generation failed." },
      { status: 500 }
    );
  }
}
