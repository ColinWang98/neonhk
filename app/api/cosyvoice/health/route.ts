import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const endpoint = normalizeEndpoint(request.nextUrl.searchParams.get("endpoint"));

  try {
    const res = await fetch(`${endpoint}/health`, { cache: "no-store" });
    const data = await res.json();

    return NextResponse.json({
      reachable: res.ok,
      endpoint,
      ...data
    });
  } catch (error) {
    return NextResponse.json(
      {
        reachable: false,
        endpoint,
        error: error instanceof Error ? error.message : "CosyVoice sidecar is not reachable."
      },
      { status: 503 }
    );
  }
}

function normalizeEndpoint(value: string | null) {
  return (value || process.env.LOCAL_TTS_BASE_URL || "http://127.0.0.1:7860").replace(/\/tts\/?$/, "").replace(/\/$/, "");
}
