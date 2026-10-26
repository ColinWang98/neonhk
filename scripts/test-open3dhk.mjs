import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/open3dhk.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const environment = { OPEN3DHK_API_KEY: "test-server-key" };
const calls = [];
let rejectAuth = false;
let ignoreRange = false;
const exports = {};
vm.runInNewContext(compiled, {
  exports, require: createRequire(import.meta.url), Buffer, URL, URLSearchParams, AbortSignal, Date,
  process: { env: environment },
  fetch: async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith("/share/check/link")) {
      return Response.json(rejectAuth ? { code: 403 } : { code: 0, data: { token: "private-token", workspaceId: "workspace" } });
    }
    if (url.pathname.endsWith("/listByWorkspace")) return Response.json({ code: 0, data: [{ category: "PANORAMA", layerId: "layer" }] });
    if (url.pathname.endsWith("/wms")) return Response.json({ features: [{ geometry: { coordinates: [114.172, 22.303, 2] }, properties: {} }] });
    if (url.pathname.endsWith("/search/nearby")) return Response.json({ code: 0, data: [
      { panoId: "original", panoName: "image", url: "/geoface/MMS/pano/route", geom: JSON.stringify({ coordinates: [114.172, 22.303, 2] }), rotationZ: 0.3 },
      { panoId: "other", panoName: "42", url: "/geoface/MMS/pano/packed.gtpanos", geom: JSON.stringify({ coordinates: [114.1721, 22.3031, 2] }) }
    ] });
    return new Response(new Uint8Array(16), { status: ignoreRange ? 200 : options.headers.Range ? 206 : 200 });
  }
});

delete environment.OPEN3DHK_API_KEY;
await assert.rejects(exports.searchOpen3dhk(22.303, 114.172, 120), /not configured/);
environment.OPEN3DHK_API_KEY = "invalid-key";
rejectAuth = true;
await assert.rejects(exports.searchOpen3dhk(22.303, 114.172, 120), /rejected/);
rejectAuth = false;
environment.OPEN3DHK_API_KEY = "test-server-key";
const images = await exports.searchOpen3dhk(22.303, 114.172, 120);
assert.equal(images.length, 2);
assert.equal(images[0].provider, "open3dhk");
assert.equal(images[0].panoId, "original");
assert(!JSON.stringify(images).includes(environment.OPEN3DHK_API_KEY));
assert(!JSON.stringify(images).includes("private-token"));
const restored = await exports.searchOpen3dhk(22.303, 114.172, 120, "original");
assert.equal(restored.length, 1);
assert.equal(restored[0].id, images[0].id);
assert.equal((await exports.searchOpen3dhk(22.303, 114.172, 120, "removed")).length, 0);
function path(image) { return new URL(image.open3dhk.folderUrl, "http://localhost").pathname.split("/").slice(4).map(decodeURIComponent); }
const packedPath = path(images[1]);
const packed = await exports.fetchOpen3dhkAsset(packedPath, "bytes=0-15");
assert.equal(packed.status, 206);
assert.equal(calls.at(-1).options.headers.Range, "bytes=0-15");
assert.equal(calls.at(-1).url.searchParams.get("key"), environment.OPEN3DHK_API_KEY);
assert.equal(calls.at(-1).url.searchParams.get("token"), "private-token");
const tilePath = [...path(images[0]), "r0", "image_nx_r0_0_0.pano"];
await exports.fetchOpen3dhkAsset(tilePath, null);
assert(calls.at(-1).url.pathname.endsWith("/route/r0/image_nx_r0_0_0.pano"));
const count = calls.length;
await assert.rejects(exports.fetchOpen3dhkAsset(["forged.token", "file"], null), /signature/);
await assert.rejects(exports.fetchOpen3dhkAsset([...path(images[0]), "..", "other"], null), /tile path/);
await assert.rejects(exports.fetchOpen3dhkAsset(packedPath, "bytes=20-1"), /byte range/);
assert.equal(calls.length, count);
ignoreRange = true;
await assert.rejects(exports.fetchOpen3dhkAsset(packedPath, "bytes=0-15"), /byte range/);
console.log("Streetscape service, key isolation, exact restore, signed tiles and byte-range checks passed.");
