import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateTextJson, textModelApiKey, type TextModelContentPart } from "@/lib/textModel";

export type VisionPart = TextModelContentPart;

export function visionModelDiagnostics() {
  return {
    provider: "deepseek",
    model: "deepseek-flash",
    hasApiKey: Boolean(textModelApiKey())
  };
}

export async function generateVisionJson(params: {
  parts: VisionPart[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  errorPrefix: string;
}) {
  return generateTextJson({
    messages: [{ role: "user", content: params.parts }],
    model: visionModelDiagnostics().model,
    temperature: params.temperature ?? 0.1,
    maxOutputTokens: params.maxOutputTokens ?? 2048,
    timeoutMs: params.timeoutMs,
    errorPrefix: params.errorPrefix
  });
}

export async function prepareVisionImagePart(imageUrl: string, errorPrefix: string): Promise<VisionPart> {
  let url = imageUrl;
  if (imageUrl.startsWith("/")) {
    const buffer = await readFile(path.join(process.cwd(), "public", imageUrl));
    url = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } else if (!imageUrl.startsWith("data:")) {
    const response = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Failed to fetch image for ${errorPrefix}: ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    url = `data:${contentType};base64,${buffer.toString("base64")}`;
  }
  return { type: "image_url", image_url: { url, detail: "original" } };
}
