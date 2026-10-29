import type { LocationKnowledge } from "@/types";
import { distanceMeters } from "@/lib/geoMath";

const inventoryUrl = "https://www.hkichdb.gov.hk/download/6b614fd1-b768-47f2-909d-d2fab9b764dd";

// Factual summaries of the December 2024 inventory, not a copy of the collection.
const entries = [
  { id: "3.32.1", title: "Tai Hang fire dragon dance", area: { lat: 22.2782, lng: 114.192, radius: 700 },
    text: "Tai Hang has a community fire dragon dance associated with the Mid-Autumn Festival." },
  { id: "3.32.2", title: "Pok Fu Lam village fire dragon dance", area: { lat: 22.2673, lng: 114.1354, radius: 400 },
    text: "Pok Fu Lam village has its own Mid-Autumn fire dragon dance tradition." },
  { id: "3.42.8", title: "Cheung Chau Jiao Festival", area: { lat: 22.208, lng: 114.0283, radius: 800 },
    text: "Cheung Chau's Jiao Festival includes a procession and bun-scrambling tradition." },
  { id: "3.10", title: "Man Mo Temple celebrations", area: { lat: 22.2838, lng: 114.1503, radius: 250 },
    text: "The Sheung Wan Man Mo Temple is associated with celebrations for Wenchang." },
  { id: "5.36", title: "Hong Kong milk tea making", match: /milk tea|cha chaan teng|奶茶|茶餐廳/i,
    text: "Hong Kong milk tea is made with repeatedly strained tea and evaporated milk." },
  { id: "5.38", title: "Ding ding candy making", match: /ding ding candy|叮叮糖/i,
    text: "Ding ding candy takes its name from the sound of cutting the candy." }
];

export function getHongKongCulturalContext(params: { lat: number; lng: number; terms: string }): LocationKnowledge[] {
  // Approximate locality anchors filter relevance; they are not event coordinates.
  return entries.filter((entry) => entry.area
    ? distanceMeters(params.lat, params.lng, entry.area.lat, entry.area.lng) <= entry.area.radius
    : entry.match!.test(params.terms)).slice(0, 2).map((entry) => ({
    id: `hk_ich:${entry.id}`,
    source: "hk_ich",
    title: entry.title,
    text: `${entry.text} This is cultural background recorded in the December 2024 inventory, not a current event listing or proof of what a particular shop sells.`,
    category: "culture",
    url: inventoryUrl,
    attribution: `Intangible Cultural Heritage Office, Hong Kong inventory (December 2024), item ${entry.id}`
  }));
}
