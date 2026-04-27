import { NextRequest, NextResponse } from "next/server";
import { searchMapillaryImages } from "@/lib/mapillary";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius") || 100);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  try {
    const images = await searchMapillaryImages(lat, lng, radius, runtimeConfigFromHeaders(request.headers));
    return NextResponse.json({ images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mapillary search failed." },
      { status: 500 }
    );
  }
}
