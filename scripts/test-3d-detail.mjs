import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/threeDetail.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { ThreeDetail, COARSE_3D_ERROR: coarse, DETAIL_3D_ERROR: fine } = exports;
const detail = new ThreeDetail();
assert(coarse > fine, "Preview must request less detail than the settled view");
detail.change(0);
assert.equal(detail.update(5000, false), coarse, "Wait for a visible, loaded preview rather than a fixed loading timer");
assert.equal(detail.update(5000, true), fine);
assert.equal(detail.update(5100, false), fine, "Pending detail downloads must not oscillate back to preview");
detail.start(6000);
assert.equal(detail.update(10000, true), coarse, "Keep preview quality throughout a held drag");
detail.end(10000);
assert.equal(detail.update(10599, true), coarse);
assert.equal(detail.update(10600, true), fine);
detail.change(11000);
detail.change(11500);
assert.equal(detail.update(12000, true), coarse, "Damping and repeated wheel/zoom changes restart settling");
assert.equal(detail.update(12100, false), coarse, "A new area still needs its own preview");
assert.equal(detail.update(12100, true), fine);
detail.change(13000);
assert.equal(detail.update(13000, true), coarse, "Reset and resize return to preview");

const viewer = await readFile(new URL("../components/HongKong3DView.tsx", import.meta.url), "utf8");
assert(viewer.includes("tiles.loadAncestors = false"));
assert(viewer.includes("tiles.loadSiblings = false"));
assert(viewer.includes('controls.addEventListener("change", cameraChanged)'));
assert(viewer.includes("tiles.processNodeQueue.running"));
assert(viewer.indexOf("tiles.update();") < viewer.indexOf("const previewReady"), "Check preview readiness after traversal, not from the old camera view");
console.log("3D preview/detail stages, drag hold, damping, wheel settling, reset, resize and direct-level loading checks passed.");
