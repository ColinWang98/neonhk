import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/logger";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { LogEvent } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LogEvent;
    if (!body.eventType || !body.payload) {
      return NextResponse.json({ error: "eventType and payload are required." }, { status: 400 });
    }

    const event = await logEvent(body, runtimeConfigFromHeaders(request.headers));
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Logging failed." },
      { status: 500 }
    );
  }
}
