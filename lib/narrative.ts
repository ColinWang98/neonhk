import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { generateTextJson } from "@/lib/textModel";
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

type StoryBrief = {
  personaMode: string;
  placeHooks: string[];
  microSceneOptions: string[];
  storySeeds: string[];
  avoidPatterns: string[];
};

const continuousNarrativePrompt = `You are writing one continuous spoken street-view story for a selected image fragment.

The output is for a narrator standing beside the user. It should sound like plain street talk, not a report, not a museum label, not a travel ad, and not academic writing.

Use the provided NarrativeEvidenceView, StoryFactPlan, persona, and PersonaFragmentPlan.

Core rules:
- Write one first-person monologue, around 120 to 220 words.
- Keep schema names hidden. Do not write section titles like "What catches my eye", "A time of day", "How people move here", "Functional-Use", or similar.
- Mention one strong or medium-confidence place fact when it helps. Say it in normal speech, not evidence language.
- Medium-confidence facts are optional. Use them carefully, with weak binding such as "Around here, X is the name I keep in mind" or "I use that name as a landmark".
- Use Google review themes only as ordinary life texture. Do not say "reviews say" or quote reviewers.
- Add one grounded everyday connection: family, friend, work, study, food, errand, queue, waiting, transport, rain, carrying bags, or a small payment. This can be fictional persona memory, but it must fit the visible place type or sourced place context.
- Treat StoryBrief.storySeeds as the strongest scene scaffolds. Pick one seed and adapt it to the persona and evidence, instead of inventing a generic street explanation.
- Give the narrator one tiny scene, not advice. Someone is meeting a cousin, buying food, looking for an entrance, carrying bags, waiting out rain, going to class, heading to work, checking a message, or choosing where to wait.
- Make that tiny scene feel like it is happening today or comes from a specific remembered day. The narrator should have a reason, a person, and a small consequence.
- Use one concrete personal link when possible: "my cousin", "my old route", "a coworker", "my landlord", "my child", "a friend from home", "a passenger", "a customer", or "someone I am meeting". Do not keep the narrator as a generic observer.
- Every kind of place can trigger ordinary personal knowledge. A campus, shop, clinic, estate, station, market, office block, footbridge, or blank-looking frontage can bring up a relative, coworker, delivery, meal, shortcut, rent, repair, queue, exam, appointment, or weather habit.
- Make the tiny scene have a reason. The narrator is a little early, late, hungry, carrying something, meeting someone, avoiding rain, comparing it with another city, or checking a message. Do not just describe how to stand or move.
- Let the place fact cause a small memory or errand. For example, a campus name can lead to a relative's course, canteen talk, studio deadlines, labs, exams, or waiting at the wrong entrance. A shop name can lead to taste, price, queue, family errands, or a quick purchase before transport.
- Follow a simple spoken arc: visible clue, personal connection, small complication, then a next action. A complication can be rain, being late, a queue, the wrong entrance, a message, a heavy bag, a busy lunch break, or a person waiting.
- Avoid turning the story into movement advice. At most one sentence can be about standing aside, finding bearings, or following the crowd. The rest must be about a person, errand, taste, class, work shift, family, queue, rain, or waiting.
- Do not write a sequence of general street rules. If a sentence sounds like advice for any street, replace it with what happened to this narrator at this place.
- Keep uncertainty only for real-world facts. The persona's own habits and memories can be direct.
- Never say "not enough evidence", "I cannot know", "I will not guess", "I will not invent", or similar policy language.
- Never label the narrator as "as a tourist", "as a temporary resident", or "as a local".
- Avoid repeated "I would". Prefer direct voice: "I slow down", "I use the sign", "I step aside", "I learned this after a few weeks here".
- Avoid repeating the same opening pattern across stories. Do not always start with "Okay" or "X is the name I hold onto".
- Avoid stiff evidence phrases: "the map and image make", "possible match here", "candidate", "Evidence Packet", "primary claims", "keep the reading modest", "frontage has a simple identity".
- Avoid generic orientation filler: "I use it first for orientation", "edge of the flow", "one sign, one corner", "stop feeling lost", "keep the passage open", "the daily rhythm is the part I trust".
- Avoid abstract or literary words: identity, rhythm, resonance, threshold, urban texture, social meaning, layers, traces, belonging, atmosphere.
- Avoid em dashes, semicolons, and long sentences. Most sentences should be short and speakable.

Good stories can start in different ways. Do not copy these exact lines, objects, or openings:
- "PolyU is the name I grab first here. I slow down near the edge, because students and office people move fast around places like this. My cousin's kid once complained about studio deadlines near campus, so the sign is not just a sign to me. It means late meals, finding the right entrance, and trying not to block someone who already knows where they are going."
- "This shopfront is the sort of place I notice when I am buying something for home. I check whether there is a queue, then I stand just off the doorway. If the reviews mention quick snacks or busy service, turn that into ordinary talk, like someone grabbing food before the bus, not a review summary."
- "The first thing I do is not romantic. I look for where people are already waiting. If the map puts a station, clinic, campus, or market around here, I use that as a small clue and then talk about the errand, the meeting point, or the way people make room."

Evidence boundary:
- NarrativeEvidenceView.primaryClaims are the only facts about the selected fragment.
- NarrativeEvidenceView.optionalNearbyClaims are optional nearby context only.
- StoryFactPlan.anchorFacts should shape the opening when they exist.
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
  const storyBrief = buildStoryBrief({
    persona,
    placeContext,
    evidencePacket,
    narrativeEvidenceView,
    storyFactPlan,
    visionDescription
  });
  const content = await generateTextJson({
    messages: [
      { role: "system", content: continuousNarrativePrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Write one continuous spoken fragment story from NarrativeEvidenceView and Persona Fragment Plan. Return the required JSON only.",
          narrativeEvidenceView,
          storyFactPlan,
          storyBrief,
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
            "Default to English. Use conversational Hong Kong street-life English without forcing Cantonese. One continuous first-person monologue. No headings. No academic phrases. No disclaimers. Use storyBrief as a menu, not a checklist. Pick one concrete micro-scene with a person, a reason, and a small complication. Make the place fact feel lived: family, study, work, food, queue, rain, transport, payment, message, or waiting. Return only spokenStory."
        })
      }
    ],
    temperature: 0.52,
    maxOutputTokens: 1200,
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

function buildStoryBrief(input: {
  persona?: GeneratedPersona;
  placeContext?: PlaceContext;
  evidencePacket?: EvidencePacket;
  narrativeEvidenceView?: NarrativeEvidenceView;
  storyFactPlan?: StoryFactPlan;
  visionDescription: VisionDescription;
}): StoryBrief {
  const text = [
    input.visionDescription.mainFeature,
    input.visionDescription.fragmentCategory,
    input.evidencePacket?.fragment.mainFeature,
    input.evidencePacket?.fragment.fragmentCategory,
    ...(input.narrativeEvidenceView?.primaryClaims.map((claim) => claim.text) || []),
    ...(input.storyFactPlan?.anchorFacts.map((fact) => fact.text) || []),
    ...(input.storyFactPlan?.supportingFacts.map((fact) => fact.text) || []),
    ...(input.placeContext?.places.slice(0, 4).map((place) => `${place.name} ${place.type || ""}`) || [])
  ].filter(Boolean).join(" ").toLowerCase();

  const personaText = [
    input.persona?.role,
    input.persona?.userIntro,
    input.persona?.background,
    input.persona?.voiceHint,
    input.persona?.interpretiveLens
  ].filter(Boolean).join(" ").toLowerCase();

  const placeHooks: string[] = [];
  const microSceneOptions: string[] = [];
  const storySeeds: string[] = [];

  if (matchesAny(text, ["university", "polytechnic", "polyu", "campus", "school", "college", "student"])) {
    placeHooks.push("campus life, entrances, students, canteens, studio or lab deadlines, exams, waiting for someone after class");
    microSceneOptions.push("connect the visible name to a cousin, friend, child, classmate, or younger relative studying nearby");
    storySeeds.push("The narrator is early to meet a younger relative or friend after class. A message mentions the wrong entrance, so the visible campus name becomes the thing they use to settle down, wait, and talk about canteen food, deadlines, or finding the right gate.");
  }
  if (matchesAny(text, ["restaurant", "cafe", "茶餐", "food", "snack", "egg waffle", "bakery", "noodle", "market"])) {
    placeHooks.push("taste, queue length, takeaway bags, cash or Octopus, buying something before transport");
    microSceneOptions.push("make the narrator remember ordering for someone, checking the queue, or deciding whether there is time to buy food");
    storySeeds.push("The narrator is buying a small snack or drink for someone before a bus or train. The queue, smell, price, or payment moment creates the tiny decision: wait, give up, or grab it quickly and move on.");
  }
  if (matchesAny(text, ["pharmacy", "dispensary", "clinic", "hospital", "medical", "藥房", "药房"])) {
    placeHooks.push("family errands, quick medicine purchase, older relatives, bright shop signs, not blocking the entrance");
    microSceneOptions.push("make it about picking something up for family, not about medical claims");
    storySeeds.push("The narrator has been asked to pick up something simple for family. The bright shop or clinic cue matters because they are trying to finish the errand quickly without blocking the doorway.");
  }
  if (matchesAny(text, ["station", "bus", "tram", "mtr", "taxi", "stop", "transport", "crossing"])) {
    placeHooks.push("transfers, missed exits, rain, checking a route message, where people pause before moving on");
    microSceneOptions.push("make the narrator check a message or meet someone near a transport cue");
    storySeeds.push("The narrator is checking a message about where to meet after transport. The selected detail becomes a practical marker because rain, traffic, or a missed exit has made the meeting slightly messy.");
  }
  if (matchesAny(text, ["shop", "store", "mall", "market", "sign", "storefront", "frontage", "entrance"])) {
    placeHooks.push("shop sign as meeting point, errands, price checking, doorway crowd, quick purchase");
    microSceneOptions.push("make the narrator use the sign because someone gave a casual direction, like 'wait by that shop'");
    storySeeds.push("Someone has told the narrator to wait near this shop or entrance. They notice the sign, a small crowd, or the doorway, then decide whether to stand there, buy something, or move a few steps away.");
  }
  if (matchesAny(text, ["estate", "residential", "building", "tower", "apartment", "public housing"])) {
    placeHooks.push("visiting family, finding the right lift lobby, delivery, security desk, wet umbrellas");
    microSceneOptions.push("make it about arriving for a visit or delivery, not architectural description");
    storySeeds.push("The narrator is visiting someone or making a delivery. The building cue matters because they are checking the lift lobby, asking the security desk, or trying not to arrive with wet bags.");
  }
  if (!placeHooks.length) {
    placeHooks.push("a specific visible clue, a small errand, waiting, rain, a message, and how people use the pavement");
    microSceneOptions.push("make the selected detail matter because it helps with one ordinary task today");
    storySeeds.push("The narrator is doing one small task today: waiting for a message, carrying something, avoiding rain, or meeting someone. The selected detail becomes useful because it gives that task a place to happen.");
  }

  const personaMode = personaStoryMode(personaText);
  const personaOptions = personaSceneOptions(personaText);
  return {
    personaMode,
    placeHooks: uniqueShort(placeHooks, 4),
    microSceneOptions: uniqueShort([...personaOptions, ...microSceneOptions], 5),
    storySeeds: uniqueShort(storySeeds, 4),
    avoidPatterns: [
      "do not make the whole story about orientation",
      "do not repeat standing aside or following the crowd",
      "do not say the place is not a grand story",
      "do not list four abstract meanings"
    ]
  };
}

function personaStoryMode(personaText: string) {
  if (matchesAny(personaText, ["tourist", "visitor", "first-time", "traveller", "traveler", "overseas"])) {
    return "visitor voice: compare with home, use one small surprise, ask practical questions, but speak from present experience";
  }
  if (matchesAny(personaText, ["temporary", "newcomer", "staying", "migrant", "short-term", "recent arrival"])) {
    return "temporary-resident voice: learned habits after a few weeks, compare with origin city, mention a friend, rental route, class, work, or grocery habit";
  }
  if (matchesAny(personaText, ["shop", "stall", "worker", "security", "driver", "teacher", "office", "delivery"])) {
    return "worker voice: short breaks, deliveries, lunch, customers, shift timing, and the practical way people share a tight street";
  }
  if (matchesAny(personaText, ["local", "resident", "neighbour", "neighbor", "retired", "retiree", "long-term"])) {
    return "local voice: family directions, old habits, errands, queue memory, wet weather routines, and names used in daily speech";
  }
  return "everyday narrator voice: direct, practical, lightly personal, not analytical";
}

function personaSceneOptions(personaText: string) {
  if (matchesAny(personaText, ["tourist", "visitor", "first-time", "traveller", "traveler", "overseas"])) {
    return ["compare the street cue with how people give directions at home", "send a photo or place name to a friend while choosing where to wait"];
  }
  if (matchesAny(personaText, ["temporary", "newcomer", "staying", "migrant", "short-term", "recent arrival"])) {
    return ["describe a habit learned after staying nearby for a few weeks", "mention a friend, classmate, landlord, coworker, or neighbour who uses this area"];
  }
  if (matchesAny(personaText, ["worker", "shop", "stall", "security", "driver", "teacher", "office", "delivery"])) {
    return ["tie the detail to lunch break, delivery timing, a customer question, or getting through a shift"];
  }
  if (matchesAny(personaText, ["local", "resident", "neighbour", "neighbor", "retired", "retiree", "long-term"])) {
    return ["use the place name the way someone gives directions to family", "connect it to a regular errand, queue, weather habit, or meeting point"];
  }
  return ["turn the visible clue into one ordinary decision made today"];
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
  return chunks.length ? chunks.slice(0, 8) : [text];
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

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function uniqueShort(values: string[], limit: number) {
  return Array.from(new Set(values)).slice(0, limit);
}
