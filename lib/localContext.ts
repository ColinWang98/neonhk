import { getGooglePlaceContext } from "@/lib/googlePlaceContext";
import { getNearbyWikidataEntities } from "@/lib/wikidata";
import { getWikipediaSummary } from "@/lib/wikipedia";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { PlaceContext, SourceNote } from "@/types";

export async function getLocalContext(params: {
  lat: number;
  lng: number;
  heading?: number;
  radius?: number;
  config?: RuntimeApiConfig;
}): Promise<PlaceContext> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const [googleContext, wikidataEntities] = await Promise.all([
      getGooglePlaceContext(params).catch(() => undefined),
      getNearbyWikidataEntities({
        lat: params.lat,
        lng: params.lng,
        heading: params.heading,
        radiusKm: Math.min(Math.max((params.radius || 150) / 1000, 0.1), 0.5),
        limit: 8,
        signal: controller.signal
      }).catch(() => [])
    ]);

    const entitiesWithArticles = wikidataEntities.filter((entity) => entity.wikipediaUrl).slice(0, 4);
    const sourceNotes = (
      await Promise.all(
        entitiesWithArticles.map((entity) =>
          getWikipediaSummary(entity.wikipediaUrl || "", entity.id, entity.relation, controller.signal).catch(
            () => undefined
          )
        )
      )
    ).filter((note): note is SourceNote => Boolean(note));

    return {
      address: googleContext?.address,
      heading: googleContext?.heading ?? (Number.isFinite(params.heading) ? normalizeDegrees(params.heading || 0) : undefined),
      places: googleContext?.places || [],
      wikidataEntities,
      sourceNotes,
      uncertainty:
        "Google Maps places, Wikidata entities, and Wikipedia notes are approximate context around the panorama coordinate. They may be near the street view point rather than inside the selected crop, so stories must connect them cautiously."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}
