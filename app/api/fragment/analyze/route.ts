import { NextRequest, NextResponse } from "next/server";
import { getAiProviderDiagnostics } from "@/lib/aiProvider";
import { logAiGeneration } from "@/lib/aiGenerationLogs";
import { persistFragment } from "@/lib/fragments";
import { logEvent } from "@/lib/logger";
import { shouldBlockFragment } from "@/lib/privacyFilter";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { analyzeFragment } from "@/lib/vision";

type AnalyzeRequest = {
  fragmentId: string;
  sessionId?: string;
  cropImageUrl: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.fragmentId || !body.cropImageUrl) {
      return NextResponse.json({ error: "fragmentId and cropImageUrl are required." }, { status: 400 });
    }

    const startedAt = performance.now();
    const aiDiagnostics = getAiProviderDiagnostics(config);
    const visionDescription = await analyzeFragment(body.cropImageUrl, config);
    const blocked = shouldBlockFragment(visionDescription.privacyRisk);
    await logAiGeneration(
      {
        sessionId: body.sessionId,
        fragmentId: body.fragmentId,
        stage: "fragment_analysis",
        provider: aiDiagnostics.vision.provider,
        model: aiDiagnostics.vision.model,
        status: "success",
        inputSummary: {
          cropImageUrl: body.cropImageUrl
        },
        output: visionDescription,
        durationMs: Math.round(performance.now() - startedAt)
      },
      config
    );
    await persistFragment({
      id: body.fragmentId,
      cropImageUrl: body.cropImageUrl,
      visionDescription,
      status: blocked ? "blocked" : "analyzing"
    }, config);
    await logEvent(
      {
        eventType: "fragment_analyzed",
        payload: {
          fragmentId: body.fragmentId,
          visionDescription
        }
      },
      config
    );

    return NextResponse.json({
      ...visionDescription,
      blocked
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
