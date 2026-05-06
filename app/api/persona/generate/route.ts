import { NextRequest, NextResponse } from "next/server";
import { fallbackPersonas, generatePersonas } from "@/lib/persona";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { analyzeSceneSnapshot, fallbackSceneDescription } from "@/lib/vision";
import type { GeneratedPersona, SceneVisualDescription, StreetImage } from "@/types";

type PersonaRequest = {
  image: StreetImage;
  snapshotUrl?: string;
};

const SCENE_ANALYSIS_TIMEOUT_MS = 6000;
const PERSONA_GENERATION_TIMEOUT_MS = 9000;

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PersonaRequest;
    if (!body.image) {
      return NextResponse.json({ error: "image is required." }, { status: 400 });
    }

    const config = runtimeConfigFromHeaders(request.headers);
    const warnings: string[] = [];
    let sceneSource: "model" | "fallback" = "fallback";
    let personaSource: "model" | "fallback" = "model";
    let sceneVisualDescription: SceneVisualDescription = fallbackSceneDescription(body.image);
    let personas: GeneratedPersona[] = [];

    try {
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
    } catch (error) {
      warnings.push(toWarning(error));
    }

    try {
      personas = await withTimeout(
        generatePersonas({
          image: body.image,
          sceneVisualDescription,
          config
        }),
        PERSONA_GENERATION_TIMEOUT_MS,
        "Persona generation"
      );
    } catch (error) {
      warnings.push(toWarning(error));
      personas = fallbackPersonas(body.image);
      personaSource = "fallback";
    }

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
