import { NextRequest, NextResponse } from "next/server";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { geminiDiagnostics } from "@/lib/gemini";
import { generateSceneOpening } from "@/lib/sceneOpening";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { upsertStorySession } from "@/lib/storySessions";
import type {
  GeneratedPersona,
  PlaceContext,
  SceneOpeningGeneration,
  SceneVisualDescription,
  StorySession,
  StreetImage
} from "@/types";

const openingCacheVersion = 3;

type SceneOpeningRequest = {
  sessionId?: string;
  image: StreetImage;
  persona: GeneratedPersona;
  sceneVisualDescription?: SceneVisualDescription;
  placeContext?: PlaceContext;
  existingOpenings?: Record<string, SceneOpeningGeneration>;
  storySession?: StorySession;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SceneOpeningRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.image || !body.persona) {
      return NextResponse.json({ error: "image and persona are required." }, { status: 400 });
    }

    const cached = body.existingOpenings?.[body.persona.id];
    if (cached?.openingText && cached.version === openingCacheVersion) {
      return NextResponse.json({
        ...cached,
        cached: true
      });
    }

    const startedAt = performance.now();
    const aiDiagnostics = geminiDiagnostics();
    const opening = await generateSceneOpening({
      image: body.image,
      persona: body.persona,
      sceneVisualDescription: body.sceneVisualDescription,
      placeContext: body.placeContext,
      config
    });
    const generation: SceneOpeningGeneration = {
      personaId: body.persona.id,
      version: openingCacheVersion,
      ...opening,
      createdAt: new Date().toISOString()
    };

    await logAiGeneration(
      {
        sessionId: body.sessionId,
        stage: "scene_opening",
        provider: aiDiagnostics.provider,
        model: aiDiagnostics.model,
        status: "success",
        inputSummary: {
          imageId: body.image.id,
          personaId: body.persona.id,
          nearbyPlaceCount: body.placeContext?.places?.length || 0,
          sourceNoteCount: body.placeContext?.sourceNotes?.length || 0
        },
        output: generation,
        durationMs: Math.round(performance.now() - startedAt)
      },
      config
    );

    if (body.storySession) {
      await upsertStorySession(
        {
          ...body.storySession,
          selectedPersona: body.persona,
          sceneVisualDescription: body.sceneVisualDescription || body.storySession.sceneVisualDescription,
          placeContext: body.placeContext || body.storySession.placeContext,
          sceneOpeningGenerations: {
            ...(body.existingOpenings || body.storySession.sceneOpeningGenerations || {}),
            [body.persona.id]: generation
          }
        },
        config
      );
    }

    return NextResponse.json({
      ...generation,
      cached: false
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scene opening generation failed." },
      { status: 500 }
    );
  }
}
