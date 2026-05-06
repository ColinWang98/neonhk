import { NextRequest, NextResponse } from "next/server";
import { getAiProviderDiagnostics } from "@/lib/aiProvider";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { fallbackPersonas, generatePersonas } from "@/lib/persona";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { analyzeSceneSnapshot, fallbackSceneDescription } from "@/lib/vision";
import type { GeneratedPersona, SceneVisualDescription, StreetImage } from "@/types";

type PersonaRequest = {
  image: StreetImage;
  sessionId?: string;
  snapshotUrl?: string;
};

const SCENE_ANALYSIS_TIMEOUT_MS = 30000;
const PERSONA_GENERATION_TIMEOUT_MS = 20000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toWarning(error: unknown) {
  return error instanceof Error ? error.message : "Unknown model error.";
}

function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();

  try {
    const body = (await request.json()) as PersonaRequest;
    if (!body.image) {
      return NextResponse.json({ error: "image is required." }, { status: 400 });
    }

    const config = runtimeConfigFromHeaders(request.headers);
    const aiDiagnostics = getAiProviderDiagnostics(config);

    console.info("[persona.generate] started", {
      requestId,
      imageId: body.image.id,
      provider: body.image.provider,
      hasSnapshotUrl: Boolean(body.snapshotUrl),
      ai: aiDiagnostics
    });

    const warnings: string[] = [];
    let sceneSource: "model" | "fallback" = "fallback";
    let personaSource: "model" | "fallback" = "model";
    let sceneVisualDescription: SceneVisualDescription = fallbackSceneDescription(body.image);
    let personas: GeneratedPersona[] = [];

    try {
      const sceneStartedAt = performance.now();
      sceneVisualDescription = await withTimeout(
        analyzeSceneSnapshot({
          image: body.image,
          snapshotUrl: body.snapshotUrl,
          config
        }),
        SCENE_ANALYSIS_TIMEOUT_MS,
        "Scene analysis"
      );
      sceneSource = sceneVisualDescription.uncertainty.toLowerCase().includes("fallback")
        ? "fallback"
        : "model";
      console.info("[persona.generate] scene_analysis_complete", {
        requestId,
        sceneSource,
        durationMs: elapsedMs(sceneStartedAt)
      });
      await logAiGeneration(
        {
          sessionId: body.sessionId,
          stage: "scene_analysis",
          provider: aiDiagnostics.vision.provider,
          model: aiDiagnostics.vision.model,
          status: sceneSource === "model" ? "success" : "fallback",
          inputSummary: {
            imageId: body.image.id,
            provider: body.image.provider,
            hasSnapshotUrl: Boolean(body.snapshotUrl)
          },
          output: sceneVisualDescription,
          durationMs: elapsedMs(sceneStartedAt)
        },
        config
      );
    } catch (error) {
      const warning = toWarning(error);
      warnings.push(warning);
      console.warn("[persona.generate] scene_analysis_fallback", {
        requestId,
        warning
      });
      await logAiGeneration(
        {
          sessionId: body.sessionId,
          stage: "scene_analysis",
          provider: aiDiagnostics.vision.provider,
          model: aiDiagnostics.vision.model,
          status: "fallback",
          inputSummary: {
            imageId: body.image.id,
            provider: body.image.provider,
            hasSnapshotUrl: Boolean(body.snapshotUrl)
          },
          output: sceneVisualDescription,
          errorMessage: warning
        },
        config
      );
    }

    try {
      const personaStartedAt = performance.now();
      personas = await withTimeout(
        generatePersonas({
          image: body.image,
          sceneVisualDescription,
          config
        }),
        PERSONA_GENERATION_TIMEOUT_MS,
        "Persona generation"
      );
      console.info("[persona.generate] persona_generation_complete", {
        requestId,
        personaCount: personas.length,
        durationMs: elapsedMs(personaStartedAt)
      });
      await logAiGeneration(
        {
          sessionId: body.sessionId,
          stage: "persona_generation",
          provider: aiDiagnostics.text.provider,
          model: aiDiagnostics.text.model,
          status: "success",
          inputSummary: {
            imageId: body.image.id,
            sceneSource
          },
          output: { personas },
          durationMs: elapsedMs(personaStartedAt)
        },
        config
      );
    } catch (error) {
      const warning = toWarning(error);
      warnings.push(warning);
      personas = fallbackPersonas(body.image);
      personaSource = "fallback";
      console.warn("[persona.generate] persona_generation_fallback", {
        requestId,
        warning
      });
      await logAiGeneration(
        {
          sessionId: body.sessionId,
          stage: "persona_generation",
          provider: aiDiagnostics.text.provider,
          model: aiDiagnostics.text.model,
          status: "fallback",
          inputSummary: {
            imageId: body.image.id,
            sceneSource
          },
          output: { personas },
          errorMessage: warning
        },
        config
      );
    }

    console.info("[persona.generate] completed", {
      requestId,
      sceneSource,
      personaSource,
      durationMs: elapsedMs(startedAt)
    });

    return NextResponse.json({
      personas,
      sceneVisualDescription,
      sceneSource,
      personaSource,
      warning: warnings.length ? warnings.join(" ") : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Persona generation failed." },
      { status: 500 }
    );
  }
}
