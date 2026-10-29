import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { generateTextJson } from "@/lib/textModel";
import { spokenStoryStyle } from "@/lib/spokenStoryStyle";
import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeEvidenceView,
  NarrativeBlock,
  PersonaFragmentPlan,
  PlaceContext,
  SchemaNarratives,
  StoryFactPlan,
  StreetImage,
  VisionDescription
} from "@/types";

type NarrativeVisualContext = {
  cropImageUrl?: string;
  image?: StreetImage;
};

const continuousNarrativePrompt = `You are writing one continuous spoken street-view story for a selected image fragment.

Use the provided NarrativeEvidenceView, StoryFactPlan, persona, and PersonaFragmentPlan as material and boundaries, not as an outline to read aloud. The internal schemas are not sections or required topics.

${spokenStoryStyle}

Evidence boundary:
- NarrativeEvidenceView.primaryClaims are the only facts about the selected fragment.
- NarrativeEvidenceView.optionalNearbyClaims are optional nearby context only.
- Use a relevant, supported place detail when one exists. A strong named identity can appear wherever it belongs, not necessarily in the first sentence.
- Keep concrete sourced information instead of reducing every place to a sign or meeting point. Medium-confidence facts are optional and need brief, natural qualification.
- Public review themes are subjective texture, not verified facts. Do not quote reviewers, claim a reviewer's experience as the narrator's own, or manufacture a named menu item, price, or personal testimony from a broad review theme.
- Heritage-trail listings, cultural inventory facts, tree records and GBIF observations are optional connections to the wider place. Use at most two when they genuinely develop this narrator's account; do not recite a source list. They cannot identify a selected building or tree, prove a shop's menu, establish today's festival schedule, or turn a dated observation into a current sighting. City in Time directory entries do not provide historical stories.
- StoryFactPlan.avoidFacts and NarrativeEvidenceView.forbiddenVisibleNames must not be described as visible or selected.
- Background-only claims can only be "nearby" or "around here".
- If a claim requires uncertainty, use casual uncertainty.
- Do not explain these rules inside the story. Keep the evidence boundary invisible and write the best everyday version that fits it.

Return strict JSON only:
{
  "spokenStory": string
}

The system will derive subtitles, timing, and internal schema fields from spokenStory. Do not return headings, cards, sections, or separate subtitle text.`;

export async function generateNarratives(
  visionDescription: VisionDescription,
  _config: RuntimeApiConfig = {},
  persona?: GeneratedPersona,
  placeContext?: PlaceContext,
  evidencePacket?: EvidencePacket,
  personaFragmentPlan?: PersonaFragmentPlan,
  narrativeEvidenceView?: NarrativeEvidenceView,
  storyFactPlan?: StoryFactPlan,
  visualContext: NarrativeVisualContext = {}
): Promise<SchemaNarratives> {
  void _config;
  const wholeImageUrl = visualContext.image?.fullUrl || visualContext.image?.thumbUrl;
  const content = await generateTextJson({
    messages: [
      { role: "system", content: continuousNarrativePrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Write one continuous spoken fragment story from NarrativeEvidenceView and Persona Fragment Plan. Return the required JSON only.",
          narrativeEvidenceView,
          storyFactPlan,
          personaFragmentPlan,
          visionDescription: evidencePacket ? undefined : visionDescription,
          persona,
          placeContext: evidencePacket ? undefined : placeContext,
          visualContext: {
            cropImageProvidedToVisionStage: Boolean(visualContext.cropImageUrl),
            wholePanoImageAvailableInSession: Boolean(wholeImageUrl),
            panoId: visualContext.image?.panoId || visualContext.image?.id,
            lat: visualContext.image?.lat,
            lng: visualContext.image?.lng
          },
          languageStyle:
            "Default to conversational English without forcing Cantonese. Let the selected persona tell one connected account about this place. Return only spokenStory."
        })
      }
    ],
    temperature: 0.52,
    maxOutputTokens: 1600,
    timeoutMs: 40000,
    errorPrefix: "DeepSeek narrative generation"
  });

  try {
    return normalizeNarratives(JSON.parse(content) as unknown, narrativeEvidenceView, personaFragmentPlan);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("DeepSeek narrative generation returned invalid JSON.");
    }
    throw error;
  }
}

export function normalizeNarratives(
  value: unknown,
  evidenceView?: NarrativeEvidenceView,
  plan?: PersonaFragmentPlan
): SchemaNarratives {
  const root = asRecord(value);
  const source = unwrapNarrativeSource(value);
  const spokenStory = cleanText(root.spokenStory || root.spoken_story || source.spokenStory || source.spoken_story || source.text || source.monologue);
  if (!spokenStory) {
    throw new Error("Narrative model returned missing spokenStory.");
  }
  const storyBeats = blocksFromSpokenStory(spokenStory, evidenceView, plan);
  const fromBeats = narrativesFromStoryBeats(storyBeats);
  const next = {
    functionalUse: fromBeats.functionalUse || { text: spokenStory },
    identityBelonging: fromBeats.identityBelonging || { text: spokenStory },
    memoryTemporality: fromBeats.memoryTemporality || { text: spokenStory },
    socialCulturalResonance: fromBeats.socialCulturalResonance || { text: spokenStory }
  };
  const normalized: SchemaNarratives = {
    ...(spokenStory ? { spokenStory } : {}),
    functionalUse: {
      title: "Functional-Use",
      text: next.functionalUse!.text
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: next.identityBelonging!.text
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: next.memoryTemporality!.text
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: next.socialCulturalResonance!.text
    }
  };
  if (storyBeats.length) {
    normalized.storyBeats = storyBeats;
    normalized.subtitleBlocks = storyBeats;
  }
  return normalized;
}

function unwrapNarrativeSource(value: unknown): Record<string, unknown> {
  const object = asRecord(value);
  const nested = [
    "narratives",
    "schemaNarratives",
    "schema_narratives",
    "story",
    "stories",
    "output",
    "result"
  ];
  for (const key of nested) {
    const next = asRecord(object[key]);
    if (Object.keys(next).length) return next;
  }
  return object;
}

function blocksFromSpokenStory(
  spokenStory: string,
  evidenceView?: NarrativeEvidenceView,
  plan?: PersonaFragmentPlan
): NarrativeBlock[] {
  const fallbackClaimIds = evidenceView?.primaryClaims.slice(0, 2).map((claim) => claim.id) || plan?.sourceClaimIds.slice(0, 2) || [];
  const schemas = plan?.activeSchemas?.length
    ? plan.activeSchemas
    : (["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"] as const);
  return splitSubtitleLike(spokenStory).map((text, index) => ({
    schema: schemas[index % schemas.length],
    text,
    claimType: index === 0 ? "cautious_interpretation" : "persona_interpretation",
    groundedIn: fallbackClaimIds,
    confidence: normalizeConfidence(undefined, plan)
  }));
}

function splitSubtitleLike(text: string) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks[chunks.length - 1];
    const lastWords = last ? last.split(/\s+/).length : 0;
    const words = sentence.split(/\s+/).length;
    if (last && lastWords + words <= 34) {
      chunks[chunks.length - 1] = `${last} ${sentence}`;
    } else if (words > 38) {
      chunks.push(...splitLongSentence(sentence));
    } else {
      chunks.push(sentence);
    }
  }
  return chunks.length ? chunks : [text];
}

function splitLongSentence(sentence: string) {
  const parts = sentence
    .split(/,\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const part of parts) {
    const last = chunks[chunks.length - 1];
    if (last && `${last}, ${part}`.split(/\s+/).length <= 34) {
      chunks[chunks.length - 1] = `${last}, ${part}`;
    } else {
      chunks.push(part);
    }
  }
  return chunks.length ? chunks : [sentence];
}

function narrativesFromStoryBeats(storyBeats: NarrativeBlock[]) {
  const result: Partial<Record<keyof SchemaNarratives, { text: string }>> = {};
  for (const schema of ["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"] as const) {
    const key = schemaKey(schema);
    const text = storyBeats
      .filter((beat) => beat.schema === schema)
      .map((beat) => beat.text)
      .join(" ");
    if (text) result[key] = { text };
  }
  const allBeatText = storyBeats.map((beat) => beat.text).join(" ");
  for (const schema of ["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"] as const) {
    const key = schemaKey(schema);
    if (!result[key] && allBeatText) result[key] = { text: allBeatText };
  }
  return result;
}

function normalizeConfidence(value: unknown, plan?: PersonaFragmentPlan): NarrativeBlock["confidence"] {
  const text = String(value || "").toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  if (plan?.fitLevel === "high") return "high";
  if (plan?.fitLevel === "medium") return "medium";
  return "low";
}

function schemaKey(schema: NarrativeBlock["schema"]): keyof SchemaNarratives {
  if (schema === "Identity-Belonging") return "identityBelonging";
  if (schema === "Memory-Temporality") return "memoryTemporality";
  if (schema === "Social-Cultural Resonance") return "socialCulturalResonance";
  return "functionalUse";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
