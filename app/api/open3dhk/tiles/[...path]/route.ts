import { fetchOpen3dhkTile } from "@/lib/open3dhkTiles";

export const runtime = "nodejs";
export const maxDuration = 40;

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    return await fetchOpen3dhkTile(path);
  } catch (error) {
    const invalid = error instanceof Error && error.message.startsWith("Invalid 3D tile");
    console.error("[open3dhk.tiles] load_failed", { path: path.join("/"), type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: invalid ? "Invalid 3D tile path." : "3D map data could not be loaded. Please try again." }, { status: invalid ? 400 : 502 });
  }
}
