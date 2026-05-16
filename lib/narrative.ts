import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type {
  EvidencePacket,
  GeneratedPersona,
  PersonaFragmentPlan,
  PlaceContext,
  SchemaNarratives,
  VisionDescription
} from "@/types";

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
- If a nearby candidate is view-aligned, close, and marked cautious_possible in the Evidence Packet, you may mention it as a possible map match in plain words: "Maps puts X roughly this way, so it could be related, but I would not swear it is this exact frontage."
- If an Evidence Packet claim comes from candidate_verifier, treat it as the visual-map reasoning result. Use its suggested wording or reason before falling back to generic phrases. This is stronger than ordinary nearby context, but still cautious unless allowedUse is direct_fact.
- If an Evidence Packet claim says a mapped building footprint intersects the selected sight line, treat it as stronger spatial evidence than an ordinary nearby place. Say it plainly but cautiously: "The map footprint and this sight line point to X." Do not call it certain unless visual text also supports it.
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
- Do not repeat the same safety sentence in all four segments. Each segment must add one new concrete thing: a named place, a sign, an entrance, a route, a material detail, a public use, or a small action.
- Prefer phrases like "I would look at...", "I would stand...", "I would not block...", "this looks like...", "Maps puts X nearby...", "I can't be sure, but...".

Use cautious language such as:
- "maybe"
- "looks like"
- "feels a bit like"
- "I would guess carefully"
- "reminds me of"
- "I would read this as"
- "I cannot know its history, but..."

Evidence boundary:
- The model input includes an Evidence Packet and a Persona Fragment Plan.
- Treat the Evidence Packet as the only source of factual claims.
- Every segment must be grounded in the plan's sourceClaimIds and activeSchemas.
- If a claim allowedUse is background_only, do not describe it as visible in the selected fragment.
- If a claim uncertaintyCueRequired is true, use cautious wording.
- If the plan narrativeMode is brief_comment, make each segment shorter and more modest.
- If the plan narrativeMode is question_or_observation, phrase the segment as a small observation or question.
- If a schema is not listed in activeSchemas, keep that segment very brief and say there is not enough evidence for a fuller story.
- If the plan localConcernLevel is low, avoid news_context and official_notice claims.

Generate four spoken story segments, each 45-75 words. They should not sound like four versions of the same point.

Hard structure for each segment:
- Sentence 1: one concrete fact or cautious map match, preferably with a name if evidence supports it.
- Sentence 2: the narrator's personal street-level judgement.
- Sentence 3: one action, habit, or small social rule.
- Sentence 4: one grounded detail from the wider street, district, campus edge, entrance, pavement, queue, nearby public context, or daily timing. Keep it ordinary.

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
    "text": "The sign and map point to a campus building, probably PolyU if that is the named match. I treat that differently from a shop. I check the proper entrance and keep the pavement clear."
  },
  "identityBelonging": {
    "title": "Identity-Belonging",
    "text": "A university name makes the place readable, but not completely open. To be honest, I would not walk in like a mall. I would pause, read the sign, then look for visitor access."
  },
  "memoryTemporality": {
    "title": "Memory-Temporality",
    "text": "A campus edge usually changes by the hour, with students, cleaners, guards, and lunch traffic. I am not claiming its old history. I would simply expect timetable pressure here."
  },
  "socialCulturalResonance": {
    "title": "Social-Cultural Resonance",
    "text": "Outside a university, the street rules get a bit sharper. People rush, wait, scan signs, and avoid blocking doors. I would stand to one side before asking where to go."
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
}`;

export async function generateNarratives(
  visionDescription: VisionDescription,
  config: RuntimeApiConfig = {},
  persona?: GeneratedPersona,
  placeContext?: PlaceContext,
  evidencePacket?: EvidencePacket,
  personaFragmentPlan?: PersonaFragmentPlan
): Promise<SchemaNarratives> {
  const ai = createAiClient(config, "text");

  if (!ai) {
    throw new Error("Narrative generation requires a configured text model.");
  }

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    ...ai.defaults,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: narrativePrompt },
      {
        role: "user",
        content: JSON.stringify({
          evidencePacket,
          personaFragmentPlan,
          visionDescription: evidencePacket ? undefined : visionDescription,
          persona,
          placeContext: evidencePacket ? undefined : placeContext,
          languageStyle:
            "Default to English. Write like plain street talk, not a literary voiceover. First-person, short, practical, slightly messy. Keep the schema logic hidden. Use only Evidence Packet claim ids and Persona Fragment Plan boundaries for facts. Each segment should be fact, personal judgement, then action. If candidate_verifier, a public institution, campus, station, hospital, museum, public building, landmark, mapped footprint match, or visible readable text supports a concrete name, mention that name early. Use concrete actions: stand, wait, pass, queue, check the sign, avoid the rain, do not block the door. Avoid poetic words such as traces, layers, resonance, threshold, memory, belonging, rhythm, atmosphere, or meaning. If a map candidate is close and view-aligned, mention it cautiously as a possible nearby match. Do not overstate it. Avoid repeating the same line across segments."
        })
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Narrative model returned no content.");
  }

  return normalizeNarratives(JSON.parse(content) as Partial<SchemaNarratives>);
}

function normalizeNarratives(
  value: Partial<SchemaNarratives>
): SchemaNarratives {
  const missing = [
    ["functionalUse.text", value.functionalUse?.text],
    ["identityBelonging.text", value.identityBelonging?.text],
    ["memoryTemporality.text", value.memoryTemporality?.text],
    ["socialCulturalResonance.text", value.socialCulturalResonance?.text]
  ].filter(([, text]) => !String(text || "").trim());
  if (missing.length) {
    throw new Error(`Narrative model returned incomplete segments: ${missing.map(([key]) => key).join(", ")}.`);
  }
  return {
    functionalUse: {
      title: "Functional-Use",
      text: value.functionalUse!.text
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: value.identityBelonging!.text
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: value.memoryTemporality!.text
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: value.socialCulturalResonance!.text
    }
  };
}
