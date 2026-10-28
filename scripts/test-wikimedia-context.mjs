import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function loadModule(path, dependencies = {}, fetchImpl = mockFetch) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    process: { env: {} }, fetch: fetchImpl,
    require: (name) => {
      assert(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });
  return exports;
}

const calls = [];
let mode = "normal";
const metadata = (value) => ({ value });
function photo(pageid, overrides = {}) {
  return {
    pageid, title: `File:Whampoa shopping arcade ${pageid}.jpg`,
    coordinates: [{ lat: 22.30657, lon: 114.18796, primary: true }],
    imageinfo: [{
      mime: "image/jpeg", url: `https://upload.wikimedia.org/${pageid}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${pageid}.jpg`,
      thumburl: `https://upload.wikimedia.org/thumb/${pageid}.jpg`,
      extmetadata: {
        ImageDescription: metadata("<p>Whampoa shopping arcade &amp; entrance.</p>"),
        Artist: metadata('<a href="/wiki/User:Example">Example photographer</a>'),
        LicenseShortName: metadata("CC BY-SA 4.0"),
        LicenseUrl: metadata("https://creativecommons.org/licenses/by-sa/4.0/"),
        DateTimeOriginal: metadata("2023-08-15 15:48:13"), ...overrides
      }
    }]
  };
}
async function mockFetch(input, options) {
  const url = new URL(input);
  calls.push({ url, options });
  assert.equal(options.next.revalidate, 86400);
  assert(options.headers["Api-User-Agent"].includes("HKSpatialStory"));
  if (mode === "http-error") return new Response("Unavailable", { status: 503 });
  if (mode === "api-error") return Response.json({ error: { info: "Search busy" } });
  if (mode === "empty") return Response.json({ query: {} });
  if (url.hostname === "en.wikivoyage.org") {
    if (url.searchParams.has("list")) return Response.json({ query: { geosearch: [
      { pageid: 2, title: "Hong Kong/Eastern District", dist: 4000 },
      { pageid: 1, title: "Hong Kong/Kowloon", dist: mode === "distant" ? 6000 : 1200 }
    ].filter((page) => mode !== "distant" || page.pageid === 1) } });
    assert.equal(url.searchParams.get("pageids"), "1", "Select the nearest guide, not the API's first result");
    return Response.json({ query: { pages: [{
      pageid: 1, title: "Hong Kong/Kowloon", fullurl: "https://en.wikivoyage.org/wiki/Hong_Kong/Kowloon",
      extract: "Kowloon has neighbourhood markets and commercial streets. ".repeat(40)
    }] } });
  }
  assert.equal(url.hostname, "commons.wikimedia.org");
  assert.equal(url.searchParams.get("ggsnamespace"), "6");
  assert.equal(url.searchParams.get("ggsradius"), "300");
  return Response.json({ query: { pages: [
    photo(1),
    photo(2, { DateTimeOriginal: metadata("unknown") }),
    photo(3, { LicenseUrl: metadata("") }),
    photo(4, { Restrictions: metadata("permission required") }),
    { ...photo(5), coordinates: [{ lat: 23, lon: 115, primary: true }] },
    { ...photo(6), title: "File:Another view 2019.jpg", imageinfo: [{ ...photo(6).imageinfo[0],
      timestamp: "2026-10-28T10:00:00Z", extmetadata: { ...photo(6).imageinfo[0].extmetadata, DateTimeOriginal: metadata("") }
    }] }
  ] } });
}

const geo = await loadModule("lib/geoMath.ts");
const wiki = await loadModule("lib/wikipedia.ts");
const dependencies = { "@/lib/geoMath": geo, "@/lib/wikipedia": wiki };
const sources = await loadModule("lib/wikimediaContext.ts", dependencies);
const params = { lat: 22.30657, lng: 114.18796, radius: 300, queries: ["Whampoa shopping arcade"] };
const notes = await sources.getNearbyWikivoyageNotes(params);
assert.equal(notes.length, 1);
assert.equal(notes[0].source, "wikivoyage");
assert.equal(notes[0].title, "Hong Kong/Kowloon");
assert(notes[0].extract.length <= 1400);
assert.equal(notes[0].license, "CC BY-SA 4.0");
const media = await sources.getNearbyCommonsMedia(params);
assert.equal(media.length, 2);
assert.equal(media[0].capturedAt, "2023-08-15");
assert.equal(media[1].capturedAt, undefined);
assert.equal(media[0].description, "Whampoa shopping arcade & entrance.");
assert.equal(media[0].attribution, "Example photographer");
assert.equal(media[0].source, "wikimedia_commons");
const noCaptureDate = await sources.getNearbyCommonsMedia({ ...params, queries: ["Another view"] });
assert.equal(noCaptureDate[0].capturedAt, undefined, "Do not infer a capture date from filename or upload timestamp");
mode = "distant";
assert.equal((await sources.getNearbyWikivoyageNotes(params)).length, 0);
for (const errorMode of ["http-error", "api-error"]) {
  mode = errorMode;
  const before = calls.length;
  await assert.rejects(sources.getNearbyCommonsMedia(params), /503|Search busy/);
  assert.equal(calls.length - before, 1, "No replacement provider or hidden retry");
}
mode = "empty";
assert.equal((await sources.getNearbyCommonsMedia(params)).length, 0);
mode = "normal";

const rag = await loadModule("lib/spatialRag.ts");
const evidence = await loadModule("lib/evidence.ts");
const view = await loadModule("lib/narrativeEvidenceView.ts");
const planner = await loadModule("lib/storyFactPlan.ts");
const local = await loadModule("lib/localContext.ts", {
  "@/lib/googlePlaceContext": { getGooglePlaceContext: async () => ({ address: "Whampoa, Hung Hom", places: [] }) },
  "@/lib/hkPublicData": {
    getHongKongLocationSearchCandidates: async () => [],
    getNearbyHongKongPublicDataCandidates: async () => [],
    getNearbyHongKongRegistryCandidates: async () => []
  },
  "@/lib/osm": { getNearbyOsmCandidates: async () => [] },
  "@/lib/placeMemory": { retrievePlaceMemoryCandidates: async () => [] },
  "@/lib/publicNews": { getPublicNewsContext: async () => [] },
  "@/lib/spatialRag": rag,
  "@/lib/wikidata": { getNearbyWikidataEntities: async () => [] },
  "@/lib/wikipedia": wiki,
  "@/lib/wikimediaContext": sources
});
const context = await local.getLocalContext(params);
assert.equal(context.sourceNotes[0].source, "wikivoyage");
assert.equal(context.commonsMedia.length, 2);
const sourceCandidates = context.ragCandidates.filter((item) => ["wikivoyage", "wikimedia_commons"].includes(item.source));
assert.equal(sourceCandidates.length, 3);
assert(sourceCandidates.every((item) => item.allowedUse === "background_only" && item.visibilityConfidence === "area_background"));
const packetInput = {
  fragmentId: "test", placeContext: context,
  visionDescription: {
    mainFeature: "a shopping arcade entrance", fragmentCategory: "commercial",
    spatialContext: "street frontage", visibleCues: ["an entrance"], possibleEverydayUses: ["shopping"],
    uncertainty: "possible", privacyRisk: { riskLevel: "low" }
  }
};
for (const crowded of [false, true]) {
  const packet = evidence.buildEvidencePacket({ ...packetInput, placeContext: crowded ? {
    ...context, ragCandidates: Array.from({ length: 18 }, (_, index) => ({
      id: `map${index}`, label: `Shop ${index}`, source: "google_places", allowedUse: "cautious_possible",
      visibilityConfidence: "possible", retrievalScore: 0.9
    }))
  } : context });
  const claims = packet.claims.filter((claim) => ["wikivoyage", "wikimedia_commons"].includes(claim.source));
  assert.equal(claims.length, 3, "Keep bounded source context even when many map candidates rank above it");
  assert(claims.every((claim) => claim.allowedUse === "background_only" && claim.visibilityStatus === "area_level_only"));
  assert(claims.every((claim) => claim.url && claim.attribution && claim.licenseUrl));
  assert.equal(claims.find((claim) => claim.id === "cm1").capturedAt, "2023-08-15");
  assert(!claims.some((claim) => claim.publishedAt), "Capture date is not a news publication date");
  assert(!packet.claims.some((claim) => claim.source === "wikipedia"), "Never relabel a guide as Wikipedia");
  if (!crowded) {
    const narrativeView = view.buildNarrativeEvidenceView(packet);
    assert(narrativeView.optionalNearbyClaims.some((claim) => claim.source === "wikivoyage"));
    assert(planner.buildStoryFactPlan(packet, narrativeView).supportingFacts.some((fact) => fact.claimId === "wv1"));
  }
}
console.log("Wikimedia retrieval, local-context wiring, evidence bounds, attribution, date handling and story-fact selection passed.");

if (process.argv.includes("--live")) {
  const live = await loadModule("lib/wikimediaContext.ts", dependencies, fetch);
  const signal = AbortSignal.timeout(8000);
  const liveNotes = await live.getNearbyWikivoyageNotes({ ...params, signal });
  const liveMedia = await live.getNearbyCommonsMedia({ ...params, signal: AbortSignal.timeout(8000) });
  assert(liveNotes.length && liveMedia.length, "Live Whampoa sources returned no usable records");
  console.log(JSON.stringify({
    liveGuide: liveNotes.map((note) => ({ title: note.title, distanceMeters: note.distanceMeters })),
    livePhotos: liveMedia.map((item) => ({ title: item.title, capturedAt: item.capturedAt, license: item.license }))
  }, null, 2));
}
