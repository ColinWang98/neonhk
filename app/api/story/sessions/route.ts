import { NextRequest, NextResponse } from "next/server";
import { listStorySessions, upsertStorySession } from "@/lib/storySessions";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { StorySession } from "@/types";

export async function GET(request: NextRequest) {
  const config = runtimeConfigFromHeaders(request.headers);
  const sessions = await listStorySessions(config);
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { session?: StorySession };
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.session?.id || !body.session.imageId) {
      return NextResponse.json({ error: "session.id and session.imageId are required." }, { status: 400 });
    }

    const session = await upsertStorySession(body.session, config);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Story session save failed." },
      { status: 500 }
    );
  }
}
