import { NextRequest, NextResponse } from "next/server";
import { listFragmentsBySession } from "@/lib/fragments";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  try {
    const fragments = await listFragmentsBySession(sessionId, runtimeConfigFromHeaders(request.headers));
    return NextResponse.json({ fragments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fragment loading failed." },
      { status: 500 }
    );
  }
}
