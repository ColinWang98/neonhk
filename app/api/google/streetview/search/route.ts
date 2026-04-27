import { NextRequest, NextResponse } from "next/server";
import { searchGoogleStreetView } from "@/lib/googleStreetView";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius") || 80);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  try {
    const images = await searchGoogleStreetView(
      lat,
      lng,
      radius,
      runtimeConfigFromHeaders(request.headers)
    );
    return NextResponse.json({ images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google Street View search failed." },
      { status: 500 }
    );
  }
}
