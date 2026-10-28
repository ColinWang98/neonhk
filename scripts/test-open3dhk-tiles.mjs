import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/open3dhkTiles.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
const env = { OPEN3DHK_API_KEY: "server-only-test-key" };
const calls = [];
let status = 200;
let body = { root: { children: [{ content: { uri: "../Tile_+080_+244/model.b3dm?key=do-not-leak" } }] } };
vm.runInNewContext(compiled, {
  exports, URL, Response, AbortSignal, process: { env },
  fetch: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return status === 200 ? Response.json(body) : new Response(null, { status });
  }
});
const response = await exports.fetchOpen3dhkTile(["1", "Data", "temp0", "tile.json"]);
const data = await response.json();
assert.equal(data.root.children[0].content.uri, "/api/open3dhk/tiles/1/Data/Tile_%2B080_%2B244/model.b3dm");
assert.equal(calls[0].url.searchParams.get("key"), env.OPEN3DHK_API_KEY);
assert.equal(calls[0].options.redirect, "error");
assert(!JSON.stringify(data).includes("key="));
const before = calls.length;
for (const path of [["..", "tile.json"], ["%2e%2e", "tile.json"], ["x/y.json"], ["x\\y.json"], ["index.html"]]) {
  await assert.rejects(exports.fetchOpen3dhkTile(path), /Invalid 3D tile/);
}
assert.equal(calls.length, before);
const base = new URL("https://data.map.gov.hk/api/3d-data/3dtiles/f2/tileset.json");
for (const uri of ["https://evil.example/file.json", "../other.json", "//evil.example/file.json"]) {
  assert.throws(() => exports.rewriteTileResources({ uri }, base), /Unexpected 3D tile/);
}
status = 403;
assert.equal((await exports.fetchOpen3dhkTile(["tileset.json"])).status, 502);
delete env.OPEN3DHK_API_KEY;
assert.equal((await exports.fetchOpen3dhkTile(["tileset.json"])).status, 503);
env.OPEN3DHK_API_KEY = "test-key";
status = 200;
body = { asset: { version: "1.1" }, root: { content: { url: "1/tile.b3dm" } } };
assert.equal((await (await exports.fetchOpen3dhkTile(["tileset.json"])).json()).root.content.url, "/api/open3dhk/tiles/1/tile.b3dm");
const viewer = await readFile(new URL("../components/StreetImageViewer.tsx", import.meta.url), "utf8");
assert(viewer.includes('inert={viewMode !== "street"}'));
assert(viewer.includes('viewMode === "street" && image'));
assert(viewer.includes('setMapHeading(povRef.current.heading)'));
const map = await readFile(new URL("../components/HongKong3DView.tsx", import.meta.url), "utf8");
assert(map.includes("controls.minDistance = 0.01") && map.includes("controls.maxDistance = 0.01"));
assert(map.includes("controls.enablePan = false") && map.includes("controls.enableZoom = false"));
assert(map.includes("eyeHeight = surface.point.z + 1.7"));
assert(map.includes("model.parent ? groundRay : earthGroundRay"));
assert(map.includes("camera.fov = THREE.MathUtils.clamp"));
console.log("3D tile proxy, key isolation, panorama retention and fixed street-level camera checks passed.");
