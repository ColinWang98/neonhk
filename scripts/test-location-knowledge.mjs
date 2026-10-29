import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, dependencies = {}, fetchImpl = mockFetch) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URL, URLSearchParams, Date, console, setTimeout, clearTimeout, AbortController, fetch: fetchImpl,
    require: (name) => { assert(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; }
  });
  return exports;
}

const geo = await load("lib/geoMath.ts");
const calls = [];
let failingSource = "";
const params = { lat: 22.27762212, lng: 114.15896975, radius: 300, topics: ["tree in a public garden"] };
const governmentLicense = "https://data.gov.hk/en/terms-and-conditions";
const feature = (properties, geometry = { type: "Point", coordinates: [params.lng, params.lat] }) => ({ properties, geometry });
const occurrence = (key, overrides = {}) => ({
  key, species: `Species ${key}`, countryCode: "HK", eventDate: "2020-04-18", datasetName: "Test observation collection",
  decimalLatitude: params.lat, decimalLongitude: params.lng, license: "https://creativecommons.org/licenses/by/4.0/legalcode", ...overrides
});

async function mockFetch(input, options) {
  const url = new URL(input);
  calls.push(url);
  assert.equal(options.next.revalidate, 86400);
  assert(options.headers["User-Agent"].includes("HKSpatialStory"));
  if (url.href.includes(failingSource) && failingSource) return new Response("Unavailable", { status: 503 });
  if (url.hostname === "www.tourism.gov.hk") {
    return new Response(`\uFEFF${JSON.stringify({ cityintime: { items: [
      { spot_num: "1", addr_eng: "Edinburgh Place", latitude: String(params.lat), longitude: String(params.lng) },
      { spot_num: "2", addr_eng: "Far away", latitude: "22.5", longitude: "114.3" },
      { spot_num: "3", addr_eng: "Missing coordinates", latitude: "", longitude: "" }
    ] } })}`);
  }
  if (url.hostname === "api.gbif.org") {
    assert.deepEqual(url.searchParams.getAll("license"), ["CC0_1_0", "CC_BY_4_0"]);
    assert(url.searchParams.get("decimalLatitude").includes(","));
    return Response.json({ results: [
      occurrence(1), occurrence(2, { species: "Species 1" }),
      occurrence(3, { license: "http://creativecommons.org/licenses/by-nc/4.0/legalcode" }),
      occurrence(4, { decimalLatitude: 23 }), occurrence(5, { eventDate: "2099-01-01" }),
      occurrence(6, { eventDate: undefined }), occurrence(7, { coordinateUncertaintyInMeters: 1000 }),
      occurrence(8, { countryCode: "CN" })
    ] });
  }
  assert.equal(url.hostname, "portal.csdi.gov.hk");
  assert.equal(url.searchParams.get("srsName"), "EPSG:4326");
  const rawBox = url.searchParams.get("bbox").split(",");
  assert.equal(rawBox[4], "urn:ogc:def:crs:EPSG::4326", "Do not depend on different registry default CRSs");
  const bbox = rawBox.slice(0, 4).map(Number);
  assert(bbox[0] < params.lat && bbox[2] > params.lat && bbox[1] < params.lng && bbox[3] > params.lng);
  if (url.searchParams.get("typeNames").includes("HT_")) {
    return Response.json({ features: [
      feature({ OBJECTID: 1, NAME: "Garden Road Peak Tram Lower Terminus", TRAIL: "Central and Western Heritage Trail", ADDRESS: "33 Garden Road" },
        { type: "MultiPoint", coordinates: [[params.lng, params.lat]] }),
      feature({ OBJECTID: 3, NAME: "Garden Road Peak Tram Lower Terminus", TRAIL: "Another route", ADDRESS: "33 Garden Road" }),
      feature({ OBJECTID: 2, NAME: "Far landmark", TRAIL: "Other route" }, { type: "Point", coordinates: [115, 23] })
    ] });
  }
  return Response.json({ features: [feature({
    OBJECTID: 1, Species_EN: "Ficus microcarpa", Location_EN: "Garden Road", OVTNo: "TEST/1", TR_no_: "TEST/1",
    Condition_EN: "A risk inspection field must not reach the story", Last_Inspection_Date: "2025/9/25"
  })] });
}

if (process.argv.includes("--live")) {
  const live = await load("lib/locationKnowledge.ts", { "@/lib/geoMath": geo }, (url, options) => fetch(url, {
    ...options, signal: AbortSignal.timeout(20000)
  }));
  const trail = await live.getHeritageTrailContext(params);
  assert(trail.some((item) => item.title.includes("Peak Tram")), "Expected a real trail stop at Garden Road");
  const trees = await live.getTreeContext({ lat: 22.283796, lng: 113.903071, radius: 200 });
  assert(trees.some((item) => item.text.includes("Cinnamomum camphora")), "Expected the verified Sha Lo Wan tree record");
  const city = await live.getCityInTimeContext({ lat: 22.2831, lng: 114.1609, radius: 200 });
  assert(city.some((item) => item.title === "Edinburgh Place"));
  const nature = await live.getNatureContext(params);
  console.log(JSON.stringify({ liveSources: { heritage: trail.length, trees: trees.length, cityDirectory: city.length, gbif: nature.length },
    samples: [...trail.slice(0, 1), ...trees.slice(0, 1), ...city.slice(0, 1), ...nature] }, null, 2));
  process.exit(0);
}

const sources = await load("lib/locationKnowledge.ts", { "@/lib/geoMath": geo });
const culture = await load("lib/hkCulturalContext.ts", { "@/lib/geoMath": geo });
const items = await sources.getNearbyLocationKnowledge(params);
assert.equal(items.length, 4);
assert.equal(items.find((item) => item.source === "hk_heritage_trail").distanceMeters, 0);
assert(items.filter((item) => item.source !== "gbif").every((item) => item.licenseUrl === governmentLicense));
assert(!items.find((item) => item.source === "hk_tree").text.includes("risk inspection"));
assert.equal(items.find((item) => item.source === "gbif").observedAt, "2020-04-18");
assert(!items.find((item) => item.source === "gbif").capturedAt);
assert(items.find((item) => item.source === "city_in_time").text.includes("metadata only"));
const callCount = calls.length;
await sources.getNearbyLocationKnowledge({ ...params, topics: ["a pharmacy storefront"] });
assert.equal(calls.slice(callCount).filter((url) => url.hostname === "api.gbif.org").length, 0, "Do not query nature for an unrelated shop");
const beforeOutside = calls.length;
assert.equal((await sources.getNearbyLocationKnowledge({ lat: 40, lng: 120 })).length, 0);
assert.equal(calls.length, beforeOutside, "Do not call Hong Kong sources outside Hong Kong");
failingSource = "devb_wb_rcd_1629267205229_51162";
const beforeFailure = calls.length;
const partial = await sources.getNearbyLocationKnowledge(params);
assert.equal(partial.length, 3);
assert.equal(calls.length - beforeFailure, 4, "No provider substitution or retries");
failingSource = "";
assert.equal(culture.getHongKongCulturalContext({ ...params, terms: "Tai Hang Restaurant, PolyU campus" }).length, 0, "A remote business name must not relocate a tradition");
const culturalItems = culture.getHongKongCulturalContext({ lat: 22.2782, lng: 114.192, terms: "milk tea" });
assert.equal(culturalItems.length, 2);
assert(culturalItems.every((item) => item.source === "hk_ich" && item.attribution.includes("2024")));

const rag = await load("lib/spatialRag.ts");
const evidence = await load("lib/evidence.ts");
const views = await load("lib/narrativeEvidenceView.ts");
const plans = await load("lib/storyFactPlan.ts");
const context = { places: [], uncertainty: "nearby", locationKnowledge: [...items, ...culturalItems],
  ...rag.buildSpatialRagContext({ ...params, locationKnowledge: [...items, ...culturalItems] }) };
assert(context.ragCandidates.every((item) => item.allowedUse === "background_only" && item.visibilityConfidence === "area_background"));
const vision = { mainFeature: "Garden Road Peak Tram Lower Terminus with trees and a garden", fragmentCategory: "heritage",
  visibleCues: ["a public garden and trees"], spatialContext: "street", possibleEverydayUses: [], uncertainty: "medium", privacyRisk: { riskLevel: "low" } };
const packet = evidence.buildEvidencePacket({ fragmentId: "test", visionDescription: vision, placeContext: context });
const added = packet.claims.filter((claim) => items.some((item) => item.id === claim.id));
assert.equal(added.length, 2, "At most two new background claims, no duplicate RAG claims");
assert(added.every((claim) => claim.allowedUse === "background_only" && claim.visibilityStatus === "area_level_only" && claim.url && claim.attribution));
assert(!packet.claims.some((claim) => claim.source === "city_in_time"), "A directory is not a historical account");
const view = views.buildNarrativeEvidenceView(packet);
const plan = plans.buildStoryFactPlan(packet, view);
assert(plan.supportingFacts.some((fact) => added.some((claim) => claim.id === fact.claimId)));
assert(!plan.anchorFacts.some((fact) => added.some((claim) => claim.id === fact.claimId)));
const shopPacket = evidence.buildEvidencePacket({ fragmentId: "shop", visionDescription: {
  ...vision, mainFeature: "a pharmacy storefront", fragmentCategory: "commercial", visibleCues: ["a shop entrance"]
}, placeContext: context });
assert(!shopPacket.claims.some((claim) => ["hk_tree", "gbif"].includes(claim.source)), "Do not attach wildlife to an unrelated shop");
const crowded = evidence.buildEvidencePacket({ fragmentId: "crowded", visionDescription: vision, placeContext: {
  ...context, ragCandidates: Array.from({ length: 18 }, (_, index) => ({
    id: `map${index}`, label: `Shop ${index}`, source: "google_places", allowedUse: "cautious_possible", visibilityConfidence: "possible"
  }))
} });
assert.equal(crowded.claims.filter((claim) => added.some((item) => item.id === claim.id)).length, 2);
const local = await load("lib/localContext.ts", {
  "@/lib/googlePlaceContext": { getGooglePlaceContext: async () => ({ address: "Tai Hang, Hong Kong", places: [] }) },
  "@/lib/hkPublicData": { getHongKongLocationSearchCandidates: async () => [], getNearbyHongKongPublicDataCandidates: async () => [], getNearbyHongKongRegistryCandidates: async () => [] },
  "@/lib/osm": { getNearbyOsmCandidates: async () => [] },
  "@/lib/placeMemory": { retrievePlaceMemoryCandidates: async () => [] },
  "@/lib/publicNews": { getPublicNewsContext: async () => [] },
  "@/lib/spatialRag": rag,
  "@/lib/wikidata": { getNearbyWikidataEntities: async () => [] },
  "@/lib/wikipedia": { getWikipediaSummary: async () => undefined },
  "@/lib/wikimediaContext": { getNearbyWikivoyageNotes: async () => [], getNearbyCommonsMedia: async () => [] },
  "@/lib/locationKnowledge": sources, "@/lib/hkCulturalContext": culture
});
const fullContext = await local.getLocalContext({ ...params, topics: [...params.topics, "milk tea"] });
assert(fullContext.locationKnowledge.some((item) => item.source === "hk_ich"));
assert(fullContext.locationKnowledge.some((item) => item.source === "gbif"));
const nearby = await load("lib/nearbyContinuation.ts", {
  "@/lib/localContext": { getLocalContext: async () => context }, "@/lib/geoMath": geo,
  "@/lib/googleStreetView": { searchGoogleStreetView: async () => [{ id: "pano" }] },
  "@/lib/open3dhk": { searchOpen3dhk: async () => [{ id: "pano" }] }
});
const recommendations = await nearby.recommendNearbyContinuations({ ...params, placeContext: context, activeSchemas: ["Memory-Temporality"] });
assert(recommendations.some((item) => item.evidenceSources.includes("city_in_time")));
assert(recommendations.some((item) => item.evidenceSources.includes("hk_heritage_trail")));
assert(recommendations.every((item) => item.streetViewAvailable));
console.log("Location sources, coordinate bounds, source rights, dates, bounded evidence and story-fact selection passed.");
