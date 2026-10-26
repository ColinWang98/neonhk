import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const environment = { DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "configured-text-model" };
const calls = [];
const replies = [];
let hang = false;
const https = {
  request(url, options, callback) {
    const call = { url, options };
    calls.push(call);
    const request = new EventEmitter();
    request.write = (payload) => { call.payload = JSON.parse(payload); };
    request.setTimeout = () => {};
    request.destroy = (error) => { if (error) request.emit("error", error); };
    request.end = () => queueMicrotask(() => {
      if (hang) return;
      const reply = replies.shift();
      assert(reply, "Unexpected external request");
      const response = new EventEmitter();
      response.statusCode = reply.status || 200;
      callback(response);
      response.emit("data", Buffer.from(JSON.stringify(reply.body || {
        choices: [{ message: { content: reply.content } }]
      })));
      response.emit("end");
    });
    return request;
  }
};

async function loadModule(file, dependencies = {}) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Buffer, URL, AbortSignal, setTimeout, clearTimeout,
    process: { env: environment, cwd: () => process.cwd() },
    require: (name) => dependencies[name] || require(name),
    fetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })
  });
  return exports;
}

const text = await loadModule("lib/textModel.ts", { "node:https": https });
const visionModel = await loadModule("lib/visionModel.ts", { "@/lib/textModel": text });
const image = await visionModel.prepareVisionImagePart("https://example.test/crop.png", "Image test");
assert.equal(image.type, "image_url");
assert.equal(image.image_url.url, "data:image/png;base64,AQID");
assert.equal(image.image_url.detail, "original");
const dataUrl = "data:image/jpeg;base64,AQID";
assert.equal((await visionModel.prepareVisionImagePart(dataUrl, "Image test")).image_url.url, dataUrl);

replies.push({ content: '{"ok":true}' });
await visionModel.generateVisionJson({ parts: [{ type: "text", text: "Describe the image." }, image], errorPrefix: "Vision test" });
assert.equal(calls.at(-1).url.hostname, "api.deepseek.com");
assert.equal(calls.at(-1).options.headers.Authorization, "Bearer test-key");
assert.equal(calls.at(-1).payload.model, "deepseek-flash", "Vision must not inherit a text-only model override");
assert.equal(calls.at(-1).payload.thinking.type, "disabled");
assert.equal(calls.at(-1).payload.response_format.type, "json_object");
assert.equal(calls.at(-1).payload.messages[0].role, "system", "JSON instruction is added for image-array inputs too");
assert.equal(calls.at(-1).payload.messages.at(-1).content[1].image_url.url, image.image_url.url);

const vision = await loadModule("lib/vision.ts", { "@/lib/visionModel": visionModel, "@/lib/textModel": text });
const description = {
  mainFeature: "A university entrance", fragmentCategory: "building", visibleText: [],
  publicEntityCandidates: [], visibleCues: ["campus facade"], privacyRisk: { riskLevel: "low" }
};
replies.push({ content: JSON.stringify(description) });
assert.equal((await vision.analyzeFragment(dataUrl)).mainFeature, description.mainFeature);
replies.push({ content: '{"sceneType":"campus"}' });
assert.equal((await vision.analyzeSceneSnapshot({ image: { id: "p1", lat: 22.3, lng: 114.1 }, snapshotUrl: dataUrl })).sceneType, "campus");

const verifier = await loadModule("lib/candidateVerification.ts", { "@/lib/visionModel": visionModel });
const verifierInput = {
  cropImageUrl: dataUrl, image: { id: "p1", fullUrl: dataUrl }, visionDescription: description,
  placeContext: { places: [{ name: "Test University", type: "university", distanceMeters: 20, viewAlignment: "inside_fragment_view" }] }
};
replies.push({ content: '{"matches":[{"candidateId":"g1","matchLevel":"possible","confidence":0.7,"allowedUse":"cautious_possible","visibilityStatus":"possibly_visible"}],"warnings":[]}' });
const verified = await verifier.verifyCandidateMatches(verifierInput);
assert.equal(verified.provider, "deepseek");
assert.equal(verified.model, "deepseek-flash");
assert.equal(verified.matches[0].label, "Test University");
assert.equal(calls.at(-1).payload.messages[0].content.filter((part) => part.type === "image_url").length, 2);

replies.push({ content: "not json" }, { content: "still not json" });
await assert.rejects(verifier.verifyCandidateMatches(verifierInput), /invalid JSON after retry/, "No silent verification skip");
const beforeMissingKey = calls.length;
delete environment.DEEPSEEK_API_KEY;
await assert.rejects(vision.analyzeFragment(dataUrl), /requires DEEPSEEK_API_KEY/);
assert.equal(calls.length, beforeMissingKey);
environment.DEEPSEEK_API_KEY = "test-key";
replies.push({ status: 401, body: { error: { message: "Invalid test key" } } });
await assert.rejects(vision.analyzeFragment(dataUrl), /Invalid test key/);
hang = true;
await assert.rejects(visionModel.generateVisionJson({ parts: [image], timeoutMs: 1000, errorPrefix: "Vision test" }), /timed out after 1000ms/);
assert(calls.every((call) => call.url.hostname === "api.deepseek.com"));
assert.equal(replies.length, 0);
console.log("DeepSeek image payloads, scene/fragment analysis, candidate verification, non-thinking JSON and explicit API/timeout errors passed. No external API called.");
