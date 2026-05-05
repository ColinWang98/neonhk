import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type ReferenceFile = {
  label: string;
  path: string;
  source: string;
  ageGender?: string;
  bytes: number;
};

const AUDIO_EXTENSIONS = new Set([".wav", ".flac", ".mp3"]);

export async function GET() {
  const root = path.join(process.cwd(), "tts_sidecar", "reference", "open-source");
  const sources = ["common-voice", "common-voice-zh-HK", "reference-pool", "clean-english", "crema-d"];

  try {
    const references = (await Promise.all(sources.map((source) => readSource(root, source)))).flat();
    return NextResponse.json({ root, references });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read reference audio files." },
      { status: 500 }
    );
  }
}

async function readSource(root: string, source: string) {
  const sourceDir = path.join(root, source);
  const entries = await safeReaddir(sourceDir);
  const files: ReferenceFile[] = [];

  for (const entry of entries) {
    const entryPath = path.join(sourceDir, entry);
    const info = await stat(entryPath);

    if (info.isDirectory()) {
      const nested = await safeReaddir(entryPath);
      for (const filename of nested) {
        const filePath = path.join(entryPath, filename);
        const fileInfo = await stat(filePath);
        if (fileInfo.isFile() && AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
          files.push({
            label: `${source}/${entry}/${filename}`,
            path: filePath,
            source,
            ageGender: entry,
            bytes: fileInfo.size
          });
        }
      }
    } else if (info.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
      files.push({
        label: `${source}/${entry}`,
        path: entryPath,
        source,
        bytes: info.size
      });
    }
  }

  return files.sort((a, b) => a.label.localeCompare(b.label));
}

async function safeReaddir(directory: string) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}
