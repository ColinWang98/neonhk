import { NextRequest, NextResponse } from "next/server";
import { getGooglePlaceContext } from "@/lib/googlePlaceContext";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const headingParam = searchParams.get("heading");
  const heading = headingParam === null ? undefined : Number(headingParam);
  const radius = Number(searchParams.get("radius") || 90);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  try {
    const context = await getGooglePlaceContext({
      lat,
      lng,
      heading: Number.isFinite(heading) ? heading : undefined,
      radius,
      config: runtimeConfigFromHeaders(request.headers)
    });
    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google place context failed." },
      { status: 500 }
    );
  }
}
