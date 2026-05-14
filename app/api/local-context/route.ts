import { NextRequest, NextResponse } from "next/server";
import { getLocalContext } from "@/lib/localContext";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const headingParam = searchParams.get("heading");
  const heading = headingParam === null ? undefined : Number(headingParam);
  const headingHalfAngleParam = searchParams.get("headingHalfAngle");
  const headingHalfAngle = headingHalfAngleParam === null ? undefined : Number(headingHalfAngleParam);
  const radius = Number(searchParams.get("radius") || 150);
  const queries = searchParams.getAll("q").map((query) => query.trim()).filter(Boolean);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  try {
    const context = await getLocalContext({
      lat,
      lng,
      heading: Number.isFinite(heading) ? heading : undefined,
      headingHalfAngle: Number.isFinite(headingHalfAngle) ? headingHalfAngle : undefined,
      radius,
      queries,
      config: runtimeConfigFromHeaders(request.headers)
    });
    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local context lookup failed." },
      { status: 500 }
    );
  }
}
