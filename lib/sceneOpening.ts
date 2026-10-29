import { generateTextJson } from "@/lib/textModel";
import { personaExperienceRules, spokenEditingRules } from "@/lib/spokenStoryStyle";
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

const sceneOpeningPrompt = `Write a short spoken opening for a Hong Kong street-level panorama.

Purpose:
- Start a conversation with someone beside the narrator, not a guided-tour briefing. Introduce the narrator and their relationship to this area briefly, without reciting their profile.
- Give the listener a sense of this particular place using an area cue, one or two clear scene details, and a useful supported piece of neighbourhood background when available. Let the persona's interests connect these naturally, not as a fixed checklist.
- The opening will be joined to a fragment story. Do not tell the user to select, tap, wait, or follow a workflow, and do not promise a story later.

Rules:
- No selected fragment is supplied. Stay at whole-scene and neighbourhood level.
- Do not claim a nearby place is visible unless the input explicitly says it is visible.
- Wikivoyage guides are optional area background, not confirmation of this exact street. Commons captions describe separate photographs, not the current panorama; their capture dates do not establish change or present conditions.
- Choose at most one useful cultural, heritage or nature fact from locationKnowledge when it fits this narrator's connection to the area. A documented local tradition can enter a conversation about an ordinary residential street without festival objects in view. Do not read out a directory, identify a visible tree from a registry, imply a festival is happening today, or turn a dated observation into a current sighting. City in Time entries are metadata, not historical accounts.
- Keep area facts at area level with a natural transition or the documented area's name. Do not turn every established fact into "maybe", "maps say", or an explanation of evidence rules.
- The first block must include a street/district/area cue from placeContext.address or nearby public places if available.
- Prefer a reliable district or area name over guessing an exact street from several nearby candidates. A nearby institution or landmark may be mentioned as nearby, not automatically as a visible building.
- Use only supplied scene observations. Do not add a crossing, entrance, queue, or route to give walking advice. Avoid inventories of signs, paving, bollards, and building materials.
- Do not invent news, ownership, former shop uses, private routines, or local history. A cultural source supports public background, not the persona's attendance at an actual festival or a claim that this street is its route.
- If publicNewsContext is provided, use it only as local concern background. It is most suitable for local residents, shop workers, and long-term Hong Kong narrators.
- Do not mention news for a tourist or first-time visitor unless it is only a very brief orientation note.
- Never say news explains a visible object or a selected fragment.
- Sound like ordinary speech: contractions, short and medium sentences, a personal reaction or small aside when it fits. A local can be familiar with an area, a temporary resident can have interests beyond commuting, and a visitor can compare it with home. Do not default to a market errand for every persona.
- No instructions about crossing, standing aside, keeping moving, finding bearings, or not blocking people. No tourism advertising, abstract cultural commentary, headings, em dashes, or long sentences.
- Do not expose missing evidence with "I cannot say" or "not enough information". Leave out an unsupported detail and keep talking naturally.
- Default to English with light Hong Kong everyday phrasing where natural.
- Return 2 to 4 subtitle-friendly blocks, around 80 to 120 words total. Blocks are pauses in one conversation, not separate topics. Do not pad weak material.

${personaExperienceRules}
${spokenEditingRules}

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
  void params.config;

  const raw = await generateTextJson({
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
          explicitAreaCue: buildAreaCue(params.placeContext),
          languageStyle:
            "Start a casual conversation in this persona's voice. Briefly say who you are and how you relate to this area, then connect a clear scene detail to useful neighbourhood knowledge if available. No walking instructions or interface directions. Keep the wider area distinct from specific visible people and objects."
        })
      }
    ],
    temperature: 0.35,
    maxOutputTokens: 1400,
    errorPrefix: "DeepSeek scene opening"
  });

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

function buildAreaCue(placeContext?: PlaceContext) {
  const placeNames = (placeContext?.places || [])
    .slice(0, 4)
    .map((place) => place.name)
    .filter(Boolean);
  const publicNames = (placeContext?.publicDataCandidates || [])
    .slice(0, 4)
    .map((candidate) => candidate.label)
    .filter(Boolean);
  return {
    address: placeContext?.address,
    nearbyNames: Array.from(new Set([...placeNames, ...publicNames])).slice(0, 6),
    sourceNotes: placeContext?.sourceNotes?.slice(0, 2).map((note) => note.title) || []
  };
}
