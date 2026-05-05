import { NextRequest, NextResponse } from "next/server";
import { generatePersonas } from "@/lib/persona";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { analyzeSceneSnapshot } from "@/lib/vision";
import type { StreetImage } from "@/types";

type PersonaRequest = {
  image: StreetImage;
  snapshotUrl?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PersonaRequest;
    if (!body.image) {
      return NextResponse.json({ error: "image is required." }, { status: 400 });
    }

    const config = runtimeConfigFromHeaders(request.headers);
    const sceneVisualDescription = await analyzeSceneSnapshot({
      image: body.image,
      snapshotUrl: body.snapshotUrl,
      config
    });
    const personas = await generatePersonas({
      image: body.image,
      sceneVisualDescription,
      config
    });

    return NextResponse.json({ personas, sceneVisualDescription });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Persona generation failed." },
      { status: 500 }
    );
  }
}
