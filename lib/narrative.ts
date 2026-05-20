import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { generateTextJson } from "@/lib/textModel";
import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeEvidenceView,
  PersonaFragmentPlan,
  PlaceContext,
  SchemaNarratives,
  StreetImage,
  VisionDescription
} from "@/types";

type NarrativeVisualContext = {
  cropImageUrl?: string;
  image?: StreetImage;
};

const narrativePrompt = `You are generating spoken place stories for a user-selected street-level image fragment.

Use only:
1. visually observable cues from the crop
2. cautious interpretation
3. the selected fictional persona as a narrator's lens
4. optional nearby place context, only as approximate context around the panorama coordinate
5. optional Wikidata/Wikipedia/news notes, only when they have a natural nearby relationship to the pano point

Do not invent:
- historical facts
- demographic identities
- community stories
- cultural traditions
- ownership
- personal information
- events that cannot be verified from the image
- abstract cultural meaning that is not grounded in the persona's everyday experience

Important distinction:
- You may let the persona speak from personal habits, memories, and comparisons, e.g. "this reminds me of the small shops near my old flat".
- Cultural interpretation is allowed, but do not make it poetic. Put it into plain street talk: where to stand, what to avoid, where to queue, whether a shop looks open, whether the pavement is tight, whether the sign helps.
- You must not claim an unverifiable fact about the actual photographed place, e.g. do not write "this shop used to be a fish shop" unless the visual evidence says so.
- Keep evidence limits backstage for every persona. Do not tell the user "there is not enough evidence", "I cannot talk about this", "I will not guess", or "I cannot know". If evidence is weak, use a smaller grounded observation, a route-finding judgement, or a personal comparison instead.
- PersonaFragmentPlan personaMustAvoid entries are internal boundaries. Do not quote them, summarize them, or turn them into refusal sentences.
- Every persona can still speak naturally without overclaiming: a local resident can use routine and street manners, a worker can use practical operations, a tourist can use wayfinding and comparison, a temporary resident can use what they have learned after staying here, and a return visitor can compare old habits with what is visible now.
- If a nearby candidate is view-aligned, close, and marked cautious_possible in the Evidence Packet, you may mention it as a possible map match in plain words: "Maps puts X roughly this way, so it could be related, but I would not swear it is this exact frontage."
- If an Evidence Packet claim comes from candidate_verifier, treat it as the visual-map reasoning result. Use its suggested wording or reason before falling back to generic phrases. This is stronger than ordinary nearby context, but still cautious unless allowedUse is direct_fact.
- If an Evidence Packet claim says a mapped building footprint intersects the selected sight line, treat it as stronger spatial evidence than an ordinary nearby place. Say it plainly but cautiously: "The map footprint and this sight line point to X." Do not call it certain unless visual text also supports it.
- Do not expose evidence machinery in the spoken story. Avoid phrases like "the map and image make", "visual-map verifier", "candidate", "matchLevel", "Evidence Packet", "primary claims", or "possible match here".
- Turn map uncertainty into normal street talk. Say "Maps puts X around this frontage", "I would treat X as a likely landmark", or "I would use that name carefully", not "the map and image make X a possible match".
- If nearby place context is only background_only, you may say a named shop or address is nearby, but do not say it is the selected fragment.
- If the Evidence Packet has direct_fact or cautious_possible claims for readable text, a publicEntityCandidate, a university, school, station, hospital, museum, public building, or named landmark, use that concrete name early. Do not hide it behind generic phrases like "this building" or "the place".
- If the crop or map strongly indicates a public building such as The Hong Kong Polytechnic University, say it plainly but cautiously when needed: "This looks like part of PolyU" or "The map and signage point to PolyU here." This is allowed for public institutions, not private people or private homes.
- If Wikidata/Wikipedia source notes are provided, treat them as sourced nearby context, not as direct evidence about the selected fragment. Use wording like "nearby, there is..." or "around this pano point..." unless the crop clearly shows that entity.
- Only weave a Wikipedia note into the story when it has a natural relation to the location or street atmosphere. Do not force a famous landmark into a tiny crop if the connection would feel random.
- If news or official notice claims are provided, treat them as local concern background. They are mainly relevant to local residents, shop workers, long-term residents, and other narrators with localConcernLevel high.
- If localConcernLevel is medium, mention news only briefly and cautiously, using wording like "I heard reports around here" or "there was coverage around this area".
- If localConcernLevel is low, do not bring in news unless it is essential for orientation. A tourist narrator should mostly notice visible environment and direction.
- Never say a news item explains the selected fragment, a closed shutter, graffiti, queue, or shop condition unless the evidence explicitly has exact address confirmation and visual support.
- Old news must sound old. Use phrases like "older reports", "in 2024", or "some past coverage", not present-tense certainty.
- Never invent news, events, ownership, former shop uses, or community history from a nearby entity name alone.
- Use first-person persona perspective by default. The writing should feel like the narrator is standing here, speaking to one visitor beside them.
- Treat the persona as an active fictional role-play speaker, not a hypothetical observer. The narrator may state their own fictional habits and experiences directly: "I usually...", "I learned...", "I still get confused by...", "Back home...", "After staying here a while...".
- Keep uncertainty only for real-world facts about the photographed place. Do not make the persona's own experience sound uncertain.
- Do not label the persona in the sentence. Never write "as a temporary-resident", "as a tourist", or "as a local resident". Let the role show through habits and comparison.
- Use the persona's background, userIntro, role, and voiceHint. Each segment should contain one small clue that only this narrator would say: a work habit, local routine, visitor comparison, short-term resident learning curve, age-related pace, or ordinary preference.
- If the persona is a temporary resident, use phrases like "after staying here a while", "I am still learning which signs matter", or "compared with where I lived before".
- If the persona is a visitor, use direct travel habits: "when I visit a street like this", "I use big signs first", "I slow down at the edge", and comparison with travel habits.
- If the persona is local or a worker, use direct lived routines: "on my usual route", "when I work nearby", "I know to leave space", plus errands, shortcuts, queue manners, shop opening rhythms, rain, delivery, lunch, transport timing, and where people stand.
- Make it oral and practical: short sentences, small reactions, concrete actions, and ordinary street judgement.
- Avoid academic or report-like language. Do not sound like an image caption, urban studies abstract, or museum label.
- Avoid literary language. Avoid phrases like "the city remembers", "traces of time", "layers of meaning", "sense of belonging", "resonance", "threshold", "ritual", "quiet poetry", or "the street tells us".
- Avoid soft abstract verbs when a direct phrase works. Prefer "I would stand here", "I would not block this bit", "this looks shut", "the sign helps", "the railing keeps people moving".
- The persona should sound ordinary: mention walking to lunch, waiting for a minibus, buying tea, avoiding rain, carrying shopping, opening a shutter, checking a sign, or finding where to stand.
- Keep it a little messy in a human way. It is fine to say "I mean", "you know", "maybe not", "to be honest", or "I would just..." when natural.
- Add a few natural spoken fillers, but do not overdo it. Good options include "you know", "I mean", "honestly", "okay", "right", "maybe", "I suppose", "to be honest", "sort of", and "a little bit". Use at most two fillers per segment.
- Avoid em dashes and long dash punctuation. Do not use "—" or "–". Use commas, periods, or short separate sentences instead.
- Avoid long complex sentences. Most sentences should be under 16 words. Break one idea into two short sentences when possible.
- Avoid semicolons and heavy clauses. The story should be easy to subtitle and easy to speak aloud.
- Avoid repeated formula phrases such as "the visible cues", "this fragment may suggest", "can be read as", "spatial context", "I would notice", and "I cannot know".
- Avoid stiff evidence phrases such as "this frontage has a simple identity", "I would keep the reading modest", "without pretending I know the whole place", "the map and image", "possible match here", and "as a temporary-resident".
- Avoid role-play hypotheticals such as "if I were visiting", "if I were working nearby", "if this were on my usual route", "I would keep it simple", and repeated "I would..." sentence starts. Use direct persona voice instead.
- Avoid meta-refusal phrases such as "there is not enough evidence", "not enough information", "I cannot describe", "I cannot talk about", "I will not speculate", "I will not invent", "I don't know enough", and "no detailed story can be provided".
- Never use evidence policy as spoken content. The user should hear a careful person, not a compliance note.
- Do not repeat the same safety sentence in all four segments. Each segment must add one new concrete thing: a named place, a sign, an entrance, a route, a material detail, a public use, or a small action.
- Prefer phrases like "I would look at...", "I would stand...", "I would not block...", "this looks like...", "Maps puts X nearby...", "from what I can see...", and "I would read it as...".
- Make the four segments feel like one small walk-through with the narrator. Start with what catches their eye, then what they do with that clue, then what it reminds them of, then how they move with other people. Do not make four separate mini reports.
- Give the narrator a tiny scene, not just an opinion. Examples: arriving from the MTR, slowing near a doorway, checking a sign while holding a drink, letting a delivery worker pass, comparing the shopfront with a street near home, or choosing where to wait in rain.
- The persona's lived action should be direct: "I slow down", "I use the sign", "I step to the side", "I learned this after a few weeks here". Use "I would" only when the action is genuinely conditional.

Use cautious language such as:
- "maybe"
- "looks like"
- "feels a bit like"
- "I would guess carefully"
- "reminds me of"
- "I would read this as"
- "from what I can see"
- "I would not treat it as certain"

Evidence boundary:
- The model input includes a NarrativeEvidenceView and a Persona Fragment Plan.
- Treat NarrativeEvidenceView.primaryClaims as the only source of factual claims about the selected fragment.
- NarrativeEvidenceView.optionalNearbyClaims are optional. Use them only as "nearby" or "around here" context, and omit them if awkward.
- Never describe optionalNearbyClaims as visible in, selected by, or identical to the fragment.
- Do not mention NarrativeEvidenceView.forbiddenVisibleNames as visible in the selected fragment.
- Every segment must be grounded in primaryClaims, optional nearby context, and activeSchemas.
- If a claim uncertaintyCueRequired is true, use cautious wording.
- If the plan narrativeMode is brief_comment, make each segment shorter and more modest.
- If the plan narrativeMode is question_or_observation, phrase the segment as a small observation or question.
- If a schema is weakly supported, use the strongest available facts and make a narrower everyday observation. Do not say the schema is unsupported.
- If the plan localConcernLevel is low, avoid news_context and official_notice claims.
- If the persona is a tourist, newcomer, temporary resident, short-term resident, first-time visitor, or return visitor, weak fit does not mean silence. Use outsider stance: first impressions, route-finding, crowd-following, travel comparison, origin-culture comparison, and what they have slowly learned after staying here. Do not pretend to know long-term local memory.
- If the persona is a local resident, shop worker, local worker, driver, retiree, teacher, security guard, or other locally familiar role, weak evidence still does not mean refusal. Use practical routine, crowd manners, opening and closing rhythms, weather habits, transport timing, or how locals avoid blocking each other.
- If the plan fitLevel is low or not_applicable, still write useful spoken observations unless the plan narrativeMode is disabled. Keep them modest and comparative.
- If the plan narrativeMode is disabled, return very brief privacy-safe text only. Do not invent a story.

Generate four spoken story segments, each 55-90 words. They should connect into a small, everyday story rather than four versions of the same point.

Loose story shape:
- Segment 1: the first useful clue, then the narrator's immediate street action.
- Segment 2: how the clue changes the narrator's feeling of approach, familiarity, or awkwardness.
- Segment 3: the simple timing of the place: lunch, rain, opening, closing, delivery, campus flow, school flow, station flow, or people passing.
- Segment 4: the social rule the narrator follows around other people.
- Every persona should turn uncertainty into a lived angle. Use one or two light personal comparisons across the full story, matched to the persona. Good examples: "where I lived before...", "after staying here a while...", "when I worked nearby...", "when I visit a street like this...", "on my usual route...". Keep it practical, not sentimental.

Do not start more than one segment with "This looks like", "I would", or "Maybe". Use different openings.

1. Functional-Use:
From the persona's viewpoint, say what a person would do here: enter, wait, pass, queue, check a sign, avoid blocking, or move on.

2. Identity-Belonging:
From the persona's viewpoint, say whether this detail makes the place easy to read, easy to approach, awkward, familiar, or closed.

3. Memory-Temporality:
From the persona's viewpoint, mention simple routine: opening, closing, cleaning, repairing, rain, lunch break, delivery, or people passing. Do not sound nostalgic unless there is real evidence.

4. Social-Cultural Resonance:
From the persona's viewpoint, say how people avoid bumping into each other, queue, give way, keep moving, or know where not to stand.

Style example to imitate. Do not copy the exact objects or facts:
{
  "functionalUse": {
    "title": "Functional-Use",
    "text": "Maps puts the named shop around this frontage, so I would use the sign carefully, not like proof. After staying here a while, I trust big shop names more than tiny street numbers. I would glance up, move aside, and let the queue breathe."
  },
  "identityBelonging": {
    "title": "Identity-Belonging",
    "text": "The shop name gives me a quick handle. Back home I might wait for a clearer doorway, but here people read fast and keep walking. I would copy that pace, check whether anyone is ordering, and not hover in front."
  },
  "memoryTemporality": {
    "title": "Memory-Temporality",
    "text": "This feels like the kind of place that changes by the hour. Maybe busy after school, quieter before lunch, wet and cramped when it rains. I would remember it by when people stop briefly, buy something, and move on."
  },
  "socialCulturalResonance": {
    "title": "Social-Cultural Resonance",
    "text": "The small rule is simple: do not block the shopfront. I learned that quickly in Hong Kong. If I need to check my phone or decide whether to buy, I step sideways first and let the faster people pass."
  }
}

Return strict JSON with this shape:
{
  "functionalUse": {
    "title": "Functional-Use",
    "text": string
  },
  "identityBelonging": {
    "title": "Identity-Belonging",
    "text": string
  },
  "memoryTemporality": {
    "title": "Memory-Temporality",
    "text": string
  },
  "socialCulturalResonance": {
    "title": "Social-Cultural Resonance",
    "text": string
  }
}

Do not return arrays, narrativeBlocks, markdown, or wrapper keys. The four top-level keys above are required.`;

export async function generateNarratives(
  visionDescription: VisionDescription,
  _config: RuntimeApiConfig = {},
  persona?: GeneratedPersona,
  placeContext?: PlaceContext,
  evidencePacket?: EvidencePacket,
  personaFragmentPlan?: PersonaFragmentPlan,
  narrativeEvidenceView?: NarrativeEvidenceView,
  visualContext: NarrativeVisualContext = {}
): Promise<SchemaNarratives> {
  void _config;
  const wholeImageUrl = visualContext.image?.fullUrl || visualContext.image?.thumbUrl;
  const content = await generateTextJson({
    messages: [
      { role: "system", content: narrativePrompt },
      {
        role: "user",
        content: JSON.stringify({
          task: "Write fragment story segments from NarrativeEvidenceView and Persona Fragment Plan. Return the required JSON only.",
          narrativeEvidenceView,
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
            "Default to English. Write like plain street talk, not a literary voiceover. First-person, short, practical, slightly messy. Keep the schema logic and evidence limits hidden. Use only Evidence Packet claim ids and Persona Fragment Plan boundaries for factual claims, but use the persona freely for practical judgement, crowd-following, route-finding, and personal comparison. Make the four segments feel like one small walk-through: first clue, approach, daily timing, social rule. If candidate_verifier, a public institution, campus, station, hospital, museum, public building, landmark, mapped footprint match, or visible readable text supports a concrete name, mention that name early. Turn that name into normal street talk, not evidence language. Use concrete actions: stand, wait, pass, queue, check the sign, avoid the rain, do not block the door. Give the narrator a tiny scene: arriving from the MTR, slowing near an entrance, checking a sign with a drink in hand, letting a delivery worker pass, choosing where to wait in rain, or comparing the frontage with a street near home. Every narrator may compare with places or routines they know, but must say it as personal perspective, not a fact about this location. Local personas should use local habits and street manners; visitor or temporary-resident personas should use wayfinding, comparison, and what they have learned by staying here. The persona is a fictional role-play speaker, so their own habits can be direct: I usually, I learned, after staying here, when I visit, on my usual route. Keep uncertainty only for real-world claims about the place. Never say not enough evidence, not enough information, I cannot talk about, I will not guess, or I will not invent. Never write as a temporary-resident, as a tourist, or as a local resident. Avoid poetic words such as traces, layers, resonance, threshold, memory, belonging, rhythm, atmosphere, or meaning. Avoid evidence phrases such as the map and image make, possible match here, or keep the reading modest. Avoid role-play hypotheticals like if I were visiting or if this were on my route. Use I would sparingly. Prefer direct action: I slow down, I use the sign, I step aside, I learned this after a few weeks here. If a map candidate is close and view-aligned, mention it cautiously as a nearby landmark. Do not overstate it. Avoid repeating the same line across segments."
        })
      }
    ],
    temperature: 0.35,
    maxOutputTokens: 3200,
    timeoutMs: 40000,
    errorPrefix: "DeepSeek narrative generation"
  });

  try {
    return normalizeNarratives(JSON.parse(content) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("DeepSeek narrative generation returned invalid JSON.");
    }
    throw error;
  }
}

export function normalizeNarratives(value: unknown): SchemaNarratives {
  const source = unwrapNarrativeSource(value);
  const fromBlocks = narrativesFromBlocks(source);
  const next = {
    functionalUse: segmentFrom(source, "functionalUse", "functional_use", "Functional-Use", "Functional Use", "functional", fromBlocks.functionalUse),
    identityBelonging: segmentFrom(source, "identityBelonging", "identity_belonging", "Identity-Belonging", "Identity Belonging", "identity", fromBlocks.identityBelonging),
    memoryTemporality: segmentFrom(source, "memoryTemporality", "memory_temporality", "Memory-Temporality", "Memory Temporality", "memory", fromBlocks.memoryTemporality),
    socialCulturalResonance: segmentFrom(source, "socialCulturalResonance", "social_cultural_resonance", "Social-Cultural Resonance", "Social Cultural Resonance", "social", fromBlocks.socialCulturalResonance)
  };
  const missing = [
    ["functionalUse.text", next.functionalUse?.text],
    ["identityBelonging.text", next.identityBelonging?.text],
    ["memoryTemporality.text", next.memoryTemporality?.text],
    ["socialCulturalResonance.text", next.socialCulturalResonance?.text]
  ].filter(([, text]) => !String(text || "").trim());
  if (missing.length) {
    throw new Error(`Narrative model returned incomplete segments: ${missing.map(([key]) => key).join(", ")}.`);
  }
  return {
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

function narrativesFromBlocks(source: Record<string, unknown>) {
  const result: Partial<Record<keyof SchemaNarratives, { text: string }>> = {};
  const blocks = arrayFromUnknown(source.narrativeBlocks) || arrayFromUnknown(source.blocks) || arrayFromUnknown(source.segments);
  for (const block of blocks || []) {
    const item = asRecord(block);
    const schema = String(item.schema || item.title || item.name || "").toLowerCase();
    const text = cleanText(item.text || item.content || item.narrative);
    if (!text) continue;
    if (schema.includes("functional")) result.functionalUse = { text };
    else if (schema.includes("identity") || schema.includes("belong")) result.identityBelonging = { text };
    else if (schema.includes("memory") || schema.includes("tempor")) result.memoryTemporality = { text };
    else if (schema.includes("social") || schema.includes("cultural") || schema.includes("resonance")) {
      result.socialCulturalResonance = { text };
    }
  }
  return result;
}

function segmentFrom(
  source: Record<string, unknown>,
  ...keysAndFallback: Array<string | { text: string } | undefined>
): { text: string } | undefined {
  const fallback = keysAndFallback.find((value): value is { text: string } => typeof value === "object" && Boolean(value?.text));
  for (const key of keysAndFallback) {
    if (typeof key !== "string") continue;
    const direct = cleanText(source[key]);
    if (direct) return { text: direct };
    const object = asRecord(source[key]);
    const text = cleanText(object.text || object.content || object.narrative || object.value);
    if (text) return { text };
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
