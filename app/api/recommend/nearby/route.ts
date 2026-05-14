import { NextResponse } from "next/server";
import { listFragmentsBySession } from "@/lib/fragments";
import { recommendNearbyContinuations } from "@/lib/nearbyContinuation";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { EvidencePacket, PlaceContext, SchemaName } from "@/types";

type RecommendNearbyRequest = {
  sessionId?: string;
  fragmentId?: string;
  lat?: number;
  lng?: number;
  personaId?: string;
  activeSchemas?: SchemaName[];
  radiusMeters?: number;
  placeContext?: PlaceContext;
  evidencePacket?: EvidencePacket;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RecommendNearbyRequest;
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
    }
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    const config = runtimeConfigFromHeaders(req.headers);
    let placeContext = body.placeContext;
    let evidencePacket = body.evidencePacket;

    if ((!placeContext || !evidencePacket) && body.sessionId && body.fragmentId) {
      const fragments = await listFragmentsBySession(body.sessionId, config);
      const fragment = fragments.find((item) => item.id === body.fragmentId);
      placeContext ||= fragment?.placeContext;
      evidencePacket ||= fragment?.evidencePacket;
    }

    const recommendations = await recommendNearbyContinuations({
      sessionId: body.sessionId,
      fragmentId: body.fragmentId,
      lat,
      lng,
      personaId: body.personaId,
      activeSchemas: body.activeSchemas,
      radiusMeters: body.radiusMeters,
      placeContext,
      evidencePacket,
      config
    });

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("[recommend.nearby] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nearby recommendations could not be prepared." },
      { status: 500 }
    );
  }
}
