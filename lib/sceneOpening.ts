import { createAiClient } from "@/lib/aiProvider";
import type {
  GeneratedPersona,
  PlaceContext,
  SceneOpeningBlock,
  SceneOpeningGeneration,
  SceneOpeningValidation,
  SceneVisualDescription,
  StreetImage
} from "@/types";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

const sceneOpeningPrompt = `Write a short spoken opening for a Hong Kong street-level panorama before the user selects any fragment.

Purpose:
- Introduce the narrator in first person.
- Explain how this narrator relates to Hong Kong or this kind of street.
- Give a concrete whole-scene overview before any fragment is selected.
- Mention only reliable scene-level context: visible whole-scene cues, pano coordinate context, nearby map context, nearby public source notes, and brief local news only when it fits the narrator.
- Invite the user to select one detail next.

Rules:
- Do not describe any selected fragment. The user has not selected one yet.
- Do not claim a nearby place is visible unless the input explicitly says it is visible.
- Use "nearby", "around here", or "in this area" for map/Wikipedia/Wikidata context.
- The opening must say what kind of street setting this appears to be, what large public elements are visible, how a visitor might orient themselves, and what detail is worth selecting next.
- If the sceneVisualDescription or map context indicates a public institution, university, campus, station, museum, hospital, government facility, or named landmark, mention it plainly but cautiously.
- Do not invent news, ownership, former shop uses, private routines, or local history.
- If publicNewsContext is provided, use it only as local concern background. It is most suitable for local residents, shop workers, and long-term Hong Kong narrators.
- Do not mention news for a tourist or first-time visitor unless it is only a very brief orientation note.
- Never say news explains a visible object or a selected fragment.
- Keep it casual and practical, not literary, not academic.
- Sound like someone walking with a visitor on the street. Use plain actions: look left, cross, wait, check a sign, avoid rain, find lunch, do not block people.
- Avoid poetic words like atmosphere, memory, layers, resonance, threshold, belonging, or meaning.
- Avoid em dashes and long sentences.
- Default to English with light Hong Kong everyday phrasing where natural.
- Return 4 subtitle-friendly blocks. Total opening should be around 85 to 130 words.

Return strict JSON:
{
  "openingBlocks": [
    {
      "text": string,
      "groundedIn": ["visual_scene" | "pano_location" | "nearby_context" | "persona_background"]
    }
  ],
  "groundingSummary": string
}`;

type SceneOpeningInput = {
  image: StreetImage;
  persona: GeneratedPersona;
  sceneVisualDescription?: SceneVisualDescription;
  placeContext?: PlaceContext;
  config?: RuntimeApiConfig;
};

export async function generateSceneOpening(params: SceneOpeningInput): Promise<Omit<SceneOpeningGeneration, "personaId" | "createdAt">> {
  const ai = createAiClient(params.config || {}, "text");

  if (!ai) {
    throw new Error("Scene opening requires a configured text model.");
  }

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    ...ai.defaults,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sceneOpeningPrompt },
      {
        role: "user",
        content: JSON.stringify({
          image: {
            provider: params.image.provider,
            lat: params.image.lat,
            lng: params.image.lng,
            panoId: params.image.panoId || params.image.id,
            capturedAt: params.image.capturedAt
          },
          persona: params.persona,
          sceneVisualDescription: params.sceneVisualDescription,
          placeContext: params.placeContext,
          localConcernLevel: localConcernLevelForOpening(params.persona),
          languageStyle:
            "Speak like a practical person orienting a visitor on the pavement. Plain, short, and concrete. No poetic voiceover. The opening should be a whole-scene overview: what kind of place this is, what big things are visible, how to move or enter, and what detail to select next. Keep map and source information cautious and scene-level."
        })
      }
    ]
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Scene opening model returned no content.");
  }

  const parsed = JSON.parse(extractJsonObject(raw)) as {
    openingBlocks?: SceneOpeningBlock[];
    groundingSummary?: string;
  };

  return normalizeSceneOpening(parsed);
}

export function validateSceneOpening(opening: Pick<SceneOpeningGeneration, "openingBlocks" | "openingText">): SceneOpeningValidation {
  const warnings: string[] = [];
  const text = opening.openingText.toLowerCase();
  if (/(selected fragment|selected shop|selected sign|this selected)/i.test(opening.openingText)) {
    warnings.push("Opening appears to refer to a selected fragment before selection.");
  }
  if (/(is the shop|is the cafe|is the restaurant|this is [a-z0-9' ]+ nearby)/i.test(text)) {
    warnings.push("Opening may overstate nearby context as visible fact.");
  }
  if (/(because of|due to|caused by).{0,80}(news|report|notice|coverage)/i.test(text)) {
    warnings.push("Opening may use news as a direct explanation.");
  }
  if (opening.openingBlocks.length < 2) {
    warnings.push("Opening is too short for the guided introduction.");
  }
  return {
    status: warnings.length ? "warning" : "passed",
    warnings
  };
}

function normalizeSceneOpening(
  parsed: { openingBlocks?: SceneOpeningBlock[]; groundingSummary?: string }
) {
  const openingBlocks = (parsed.openingBlocks || [])
    .map((block) => ({
      text: String(block.text || "").replace(/\s+/g, " ").trim(),
      groundedIn: normalizeGrounding(block.groundedIn)
    }))
    .filter((block) => block.text)
    .slice(0, 5);

  if (openingBlocks.length === 0) {
    throw new Error("Scene opening model returned no opening blocks.");
  }

  const openingText = openingBlocks.map((block) => block.text).join("\n\n");
  const validation = validateSceneOpening({ openingBlocks, openingText });
  const blockingWarnings = validation.warnings.filter((warning) =>
    /selected fragment|direct explanation/i.test(warning)
  );
  if (blockingWarnings.length) {
    throw new Error(`Scene opening validation failed: ${blockingWarnings.join(" ")}`);
  }
  return {
    openingText,
    openingBlocks,
    groundingSummary: parsed.groundingSummary || "Opening grounded in provided scene context.",
    openingValidation: validation
  };
}

function normalizeGrounding(value: unknown): SceneOpeningBlock["groundedIn"] {
  const allowed: SceneOpeningBlock["groundedIn"] = [
    "visual_scene",
    "pano_location",
    "nearby_context",
    "persona_background"
  ];
  if (!Array.isArray(value)) return ["persona_background"];
  const next = value.filter((item): item is SceneOpeningBlock["groundedIn"][number] =>
    allowed.includes(item)
  );
  return next.length ? next : ["persona_background"];
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Scene opening model returned non-JSON content.");
  }

  return match[0];
}

function localConcernLevelForOpening(persona: GeneratedPersona) {
  const text = [persona.role, persona.background, persona.userIntro, persona.voiceHint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/visitor|tourist|first-time|overseas|travell?ing/.test(text)) return "low";
  if (/resident|local|neighbour|neighbor|shop|stall|worker|retired|teacher|district/.test(text)) return "high";
  return "medium";
}
