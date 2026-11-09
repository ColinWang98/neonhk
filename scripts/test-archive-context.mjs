import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, dependencies = {}, fetchImpl = mockFetch) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    fetch: fetchImpl,
    require: (name) => { assert(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; }
  });
  return exports;
}

const hk = { isHongKongCoordinate: (lat, lng) => lat >= 22.15 && lat <= 22.57 && lng >= 113.83 && lng <= 114.45 };
const params = { lat: 22.28, lng: 114.16, placeNames: ["Hong Kong", "Central Market", "Sheung Wan", "Hung Hom"] };
const license = "https://creativecommons.org/licenses/by/4.0/";
const record = (identifier, overrides = {}) => ({
  identifier, title: "Central Market, Hong Kong", creator: ["Catalog creator"],
  description: "<p>A historical account of Central Market &amp; its surroundings in Hong Kong.</p>",
  coverage: ["Hong Kong"], mediatype: "texts", date: "1965", licenseurl: license, ...overrides
});
let mode = "normal";
const calls = [];
async function mockFetch(input, options) {
  const url = new URL(input);
  calls.push({ url, options });
  assert.equal(url.hostname, "archive.org");
  assert.equal(url.pathname, "/advancedsearch.php");
  assert.equal(url.searchParams.get("rows"), "12");
  assert(url.searchParams.get("q").includes('"Central Market" OR "Sheung Wan"'));
  assert(!url.searchParams.get("q").includes("Hung Hom"), "Bound the number of place terms");
  assert.equal(options.next.revalidate, 86400);
  assert(options.headers["User-Agent"].includes("HKSpatialStory"));
  assert(!options.headers.Authorization, "No key or registration");
  if (mode === "http-error") return new Response("Busy", { status: 429 });
  if (mode === "invalid") return Response.json({ response: {} });
  return Response.json({ response: { docs: mode === "empty" ? [] : [
    record("good", mode === "index-date" ? { date: "1965-01-01T00:00:00Z" } : {}), record("good"),
    record("no_license", { licenseurl: undefined }),
    record("noncommercial", { licenseurl: "https://creativecommons.org/licenses/by-nc/4.0/" }),
    record("noderivatives", { licenseurl: "https://creativecommons.org/licenses/by-nd/4.0/" }),
    record("ambiguous", { licenseurl: [license, "All rights reserved"] }),
    record("restricted", { "access-restricted-item": true }),
    record("other_area", { title: "Hong Kong elsewhere", description: "A history of a different neighbourhood." }),
    record("incidental", { title: "A Hong Kong feature film", description: "The long film synopsis mentions Central Market in passing.", subject: "cinema" }),
    record("other_country", { title: "Central Market, Australia", description: "Central Market in Australia.", coverage: "Australia" }),
    record("no_creator", { creator: "" }),
    record("not_a_source", { mediatype: "collection" }),
    record("bad/id"),
    record("cc0", { licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/", date: undefined, addeddate: "2026-10-29", publicdate: "2026-10-29" }),
    record("beyond_limit", { date: "1965-01-01T00:00:00Z" })
  ] } });
}

const archive = await load("lib/archiveContext.ts", { "@/lib/locationKnowledge": hk });
const items = await archive.getArchiveContext(params);
assert.equal(calls.length, 1);
assert.equal(items.length, 2);
assert.equal(items[0].id, "internet_archive:good");
assert.equal(items[0].sourceDate, "1965", "Retain the date's supplied precision");
assert.equal(items[0].description, "A historical account of Central Market & its surroundings in Hong Kong.");
assert.equal(items[0].matchedPlace, "Central Market");
assert.equal(items[1].license, "CC0 1.0");
assert.equal(items[1].sourceDate, undefined, "An upload date is not a source date");
assert.equal(items[0].lat, undefined, "Textual place association does not supply geographic coordinates");
assert.equal(items[0].distanceMeters, undefined);
mode = "index-date";
assert.equal((await archive.getArchiveContext(params))[0].sourceDate, "1965", "Do not treat an index-normalized timestamp as an exact source day");
mode = "normal";
const beforeSkip = calls.length;
assert.equal((await archive.getArchiveContext({ ...params, lat: 40 })).length, 0);
assert.equal((await archive.getArchiveContext({ ...params, placeNames: ["Hong Kong", "Kowloon", "China"] })).length, 0);
assert.equal(calls.length, beforeSkip);
const chinese = await load("lib/archiveContext.ts", { "@/lib/locationKnowledge": hk }, async (input) => {
  assert(new URL(input).searchParams.get("q").includes('"大坑"'), "Two-character Hong Kong place names are valid search terms");
  return Response.json({ response: { docs: [] } });
});
await chinese.getArchiveContext({ ...params, placeNames: ["香港", "大坑"] });
for (const fail of ["http-error", "invalid"]) {
  mode = fail;
  const before = calls.length;
  await assert.rejects(archive.getArchiveContext(params), /429|invalid response/);
  assert.equal(calls.length, before + 1, "No hidden retry or substitute source");
}
mode = "empty";
assert.equal((await archive.getArchiveContext(params)).length, 0);
mode = "normal";

const rag = await load("lib/spatialRag.ts");
const evidence = await load("lib/evidence.ts");
const view = await load("lib/narrativeEvidenceView.ts");
const planner = await load("lib/storyFactPlan.ts");
const local = await load("lib/localContext.ts", {
  "@/lib/archiveContext": archive,
  "@/lib/googlePlaceContext": { getGooglePlaceContext: async () => ({ address: "Central Market, Sheung Wan, Hong Kong", places: [] }) },
  "@/lib/hkPublicData": {
    getHongKongLocationSearchCandidates: async () => [], getNearbyHongKongPublicDataCandidates: async () => [], getNearbyHongKongRegistryCandidates: async () => []
  },
  "@/lib/osm": { getNearbyOsmCandidates: async () => [] },
  "@/lib/placeMemory": { retrievePlaceMemoryCandidates: async () => [] },
  "@/lib/publicNews": { getPublicNewsContext: async () => [] },
  "@/lib/spatialRag": rag,
  "@/lib/wikidata": { getNearbyWikidataEntities: async () => [] },
  "@/lib/wikipedia": { getWikipediaSummary: async () => undefined },
  "@/lib/wikimediaContext": { getNearbyCommonsMedia: async () => [], getNearbyWikivoyageNotes: async () => [] },
  "@/lib/locationKnowledge": { ...hk, getNearbyLocationKnowledge: async () => [] },
  "@/lib/hkCulturalContext": { getHongKongCulturalContext: () => [] }
});
const context = await local.getLocalContext({ lat: params.lat, lng: params.lng });
assert.equal(context.archiveContext.length, 2);
assert(context.ragCandidates.every((candidate) => candidate.allowedUse === "background_only" && candidate.visibilityConfidence === "area_background"));
const packetInput = {
  fragmentId: "archive-test", placeContext: context,
  visionDescription: {
    mainFeature: "a market entrance", fragmentCategory: "commercial", spatialContext: "street-facing", visibleText: [],
    visibleCues: ["an entrance"], possibleEverydayUses: ["shopping"],
    privacyRisk: { riskLevel: "low" }, uncertainty: "low"
  }
};
const packet = evidence.buildEvidencePacket(packetInput);
const archiveClaims = packet.claims.filter((claim) => claim.source === "internet_archive");
assert.equal(archiveClaims.length, 2, "No duplicate RAG copies");
assert(archiveClaims.every((claim) => claim.allowedUse === "background_only" && claim.spatialMatch === "area_only" && claim.licenseUrl));
assert.equal(archiveClaims[0].publishedAt, "1965");
assert.equal(archiveClaims[0].capturedAt, undefined);
const evidenceView = view.buildNarrativeEvidenceView(packet);
assert(!evidenceView.primaryClaims.some((claim) => claim.source === "internet_archive"));
const factPlan = planner.buildStoryFactPlan(packet, evidenceView);
assert(factPlan.supportingFacts.some((fact) => fact.claimId.startsWith("internet_archive:")));
const crowded = evidence.buildEvidencePacket({ ...packetInput, placeContext: { ...context, ragCandidates: Array.from({ length: 18 }, (_, index) => ({
  id: `place${index}`, label: `Nearby place ${index}`, source: "google_places", allowedUse: "cautious_possible", visibilityConfidence: "possible"
})) } });
assert.equal(crowded.claims.filter((claim) => claim.source === "internet_archive").length, 2, "The generic map-candidate cap must not discard the archive source");
mode = "http-error";
const partial = await local.getLocalContext({ lat: params.lat, lng: params.lng });
assert.equal(partial.archiveContext.length, 0);
assert(!partial.ragCandidates.some((candidate) => candidate.source === "internet_archive"), "Source failure supplies no invented evidence");
console.log("Archive search, source rights, local-context wiring, bounded background claims and story-fact selection passed.");

if (process.argv.includes("--live")) {
  const live = await load("lib/archiveContext.ts", { "@/lib/locationKnowledge": hk }, fetch);
  for (const location of [params, { lat: 22.328, lng: 114.16, placeNames: ["Sham Shui Po", "深水埗"] }]) {
    const result = await live.getArchiveContext({ ...location, signal: AbortSignal.timeout(8000) });
    console.log(JSON.stringify({ places: location.placeNames, liveEligibleRecords: result.length, records: result }, null, 2));
  }
}
