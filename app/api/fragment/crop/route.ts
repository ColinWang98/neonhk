import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { persistFragment } from "@/lib/fragments";
import { cropImageFragment } from "@/lib/imageCrop";
import { logEvent } from "@/lib/logger";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import type { ImageCropBox, PanoramaPov, ScreenBox } from "@/types";

type CropRequest = {
  imageId: string;
  sessionId?: string;
  imageUrl: string;
  screenBox: ScreenBox;
  cropBox: ImageCropBox;
  panoramaPov?: PanoramaPov;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CropRequest;
    const config = runtimeConfigFromHeaders(request.headers);

    if (!body.imageId || !body.imageUrl || !body.screenBox || !body.cropBox) {
      return NextResponse.json({ error: "imageId, imageUrl, screenBox, and cropBox are required." }, { status: 400 });
    }

    const fragmentId = randomUUID();
    const selectedAt = new Date().toISOString();
    const result = await cropImageFragment({
      imageUrl: body.imageUrl,
      cropBox: body.cropBox,
      fragmentId,
      config
    });

    await logEvent(
      {
        eventType: "fragment_cropped",
        payload: {
          fragmentId,
          imageId: body.imageId,
          screenBox: body.screenBox,
          cropBox: result.cropBox,
          cropImageUrl: result.cropImageUrl
        }
      },
      config
    );
    await persistFragment({
      id: fragmentId,
      sessionId: body.sessionId,
      imageId: body.imageId,
      selectedAt,
      screenBox: body.screenBox,
      cropBox: result.cropBox,
      cropImageUrl: result.cropImageUrl,
      panoramaPov: body.panoramaPov,
      status: "cropping"
    }, config);

    return NextResponse.json({ fragmentId, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cropping failed." },
      { status: 500 }
    );
  }
}
