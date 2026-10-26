import { NextRequest, NextResponse } from "next/server";
import { searchOpen3dhk } from "@/lib/open3dhk";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radius = Number(params.get("radius") || 120);
  if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < 22.1 || lat > 22.6 || lng < 113.8 || lng > 114.5 || !Number.isFinite(radius) || radius < 1 || radius > 500) {
    return NextResponse.json({ error: "A Hong Kong location and a radius between 1 and 500 metres are required." }, { status: 400 });
  }
  try {
    const images = await searchOpen3dhk(lat, lng, radius, params.get("panoId") || undefined);
    return NextResponse.json({ images }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Streetscape 360 search failed." }, { status: 502 });
  }
}
