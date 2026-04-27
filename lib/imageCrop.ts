import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { ImageCropBox } from "@/types";

export async function cropImageFragment(params: {
  imageUrl: string;
  cropBox: ImageCropBox;
  fragmentId: string;
  config?: RuntimeApiConfig;
}) {
  const res = await fetch(params.imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch source image: ${res.status}`);
  }

  const source = Buffer.from(await res.arrayBuffer());
  const metadata = await sharp(source).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

  const left = clamp(Math.round(params.cropBox.x), 0, Math.max(0, imageWidth - 1));
  const top = clamp(Math.round(params.cropBox.y), 0, Math.max(0, imageHeight - 1));
  const width = clamp(Math.round(params.cropBox.width), 1, imageWidth - left);
  const height = clamp(Math.round(params.cropBox.height), 1, imageHeight - top);

  const cropBuffer = await sharp(source)
    .extract({ left, top, width, height })
    .jpeg({ quality: 88 })
    .toBuffer();

  const fileName = `${params.fragmentId}.jpg`;
  const publicPath = `generated/crops/${fileName}`;
  const supabase = getSupabaseAdmin(params.config);

  if (supabase) {
    const { error } = await supabase.storage
      .from("street-fragments")
      .upload(publicPath, cropBuffer, {
        contentType: "image/jpeg",
        upsert: true
      });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from("street-fragments").getPublicUrl(publicPath);
    return {
      cropImageUrl: data.publicUrl,
      cropBox: { x: left, y: top, width, height }
    };
  }

  const outputDir = path.join(process.cwd(), "public", "generated", "crops");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, fileName), cropBuffer);

  return {
    cropImageUrl: `/generated/crops/${fileName}`,
    cropBox: { x: left, y: top, width, height }
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
