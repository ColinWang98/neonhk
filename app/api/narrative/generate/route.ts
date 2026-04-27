import { NextRequest, NextResponse } from "next/server";
import { persistFragment } from "@/lib/fragments";
import { logEvent } from "@/lib/logger";
import { generateNarratives } from "@/lib/narrative";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { VisionDescription } from "@/types";

type NarrativeRequest = {
  fragmentId: string;
  visionDescription: VisionDescription;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NarrativeRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.fragmentId || !body.visionDescription) {
      return NextResponse.json({ error: "fragmentId and visionDescription are required." }, { status: 400 });
    }

    const narratives = await generateNarratives(body.visionDescription, config);
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
