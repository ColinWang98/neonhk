import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function loadModule(file, dependencies = {}) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, process, performance,
    console: { error() {}, warn() {} },
    require: (name) => dependencies[name] || require(name)
  });
  return exports;
}

const privacy = await loadModule("lib/privacyFilter.ts");
const vision = { mainFeature: "Campus entrance", privacyRisk: { riskLevel: "low" } };
const baseRow = { id: "f1", image_id: "p1", screen_box: {}, crop_box: {}, vision_description: vision };
const rows = [
  { ...baseRow, status: "analyzing" },
  { ...baseRow, id: "f2", status: "generating" },
  { ...baseRow, id: "f3", status: "cropping", vision_description: null },
  { ...baseRow, id: "f4", status: "analyzing", vision_description: { privacyRisk: { riskLevel: "high" } } },
  { ...baseRow, id: "f5", status: "error" },
  { ...baseRow, id: "f6", status: "blocked" }
];
const query = { select: () => query, eq: () => query, order: async () => ({ data: rows }) };
const fragments = await loadModule("lib/fragments.ts", {
  "@/lib/supabase": { getSupabaseAdmin: () => ({ from: () => query }) },
  "@/lib/privacyFilter": privacy
});
const restored = await fragments.listFragmentsBySession("session");
assert.equal(restored.map((fragment) => fragment.status).join(","), "ready,ready,error,blocked,error,blocked");
assert.equal(restored[0].visionDescription.mainFeature, vision.mainFeature);

const { useExplorerStore: store } = await loadModule("lib/store.ts");
const active = { id: "current", status: "generating" };
const pending = { id: "pending-1", status: "cropping" };
store.getState().setFragments([active, pending]);
store.getState().restoreFragments([{ id: "current", status: "analyzing" }, ...restored], true);
assert.equal(store.getState().fragments[0], active, "Late history must not overwrite an active request");
assert.equal(store.getState().fragments[1], pending, "A new selection must not disappear during history loading");
assert.equal(store.getState().fragments.length, 8);
store.getState().restoreFragments(restored);
assert.equal(store.getState().fragments.length, 8, "Restoring twice must not duplicate fragments");
store.getState().setFragments([{ ...restored[0], status: "analyzing" }]);
store.getState().restoreFragments(restored);
assert.equal(store.getState().fragments[0].status, "ready", "An interrupted in-memory stage must also resume after remount");

const writes = [];
let analysis = vision;
let failure;
const route = await loadModule("app/api/fragment/analyze/route.ts", {
  "@/lib/aiGenerationLogs": { logAiGeneration: async () => {} },
  "@/lib/fragments": { persistFragment: async (record) => { writes.push(record); } },
  "@/lib/visionModel": { visionModelDiagnostics: () => ({ provider: "deepseek", model: "deepseek-flash" }) },
  "@/lib/logger": { logEvent: async () => {} },
  "@/lib/privacyFilter": privacy,
  "@/lib/runtimeConfig": { runtimeConfigFromHeaders: () => ({}) },
  "@/lib/vision": { analyzeFragment: async () => { if (failure) throw failure; return analysis; } }
});
function request() {
  return new Request("http://localhost/api/fragment/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fragmentId: "f1", cropImageUrl: "https://example.test/crop.jpg" })
  });
}
assert.equal((await route.POST(request())).status, 200);
assert.equal(writes.at(-1).status, "ready", "Completed analysis must not persist an active loading status");
analysis = { privacyRisk: { riskLevel: "high" } };
assert.equal((await (await route.POST(request())).json()).blocked, true);
assert.equal(writes.at(-1).status, "blocked");
failure = new Error("Analysis timed out");
assert.equal((await route.POST(request())).status, 500);
assert.equal(writes.at(-1).status, "error");
console.log("Completed/interrupted fragment restoration, privacy boundaries, late history merge and persisted analysis states passed. No external API called.");
