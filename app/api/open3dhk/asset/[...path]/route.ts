import { NextRequest, NextResponse } from "next/server";
import { fetchOpen3dhkAsset } from "@/lib/open3dhk";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const upstream = await fetchOpen3dhkAsset(path, request.headers.get("range"));
    if (!upstream.ok) return NextResponse.json({ error: `Streetscape imagery returned HTTP ${upstream.status}.` }, { status: 502 });
    const headers = new Headers({ "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" });
    for (const name of ["content-range", "content-length", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Streetscape imagery could not be loaded." }, { status: 400 });
  }
}
