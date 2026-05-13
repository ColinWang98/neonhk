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
5. optional Wikidata/Wikipedia notes, only when they have a natural nearby relationship to the pano point

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
- Cultural interpretation is allowed and desired, but it must be internalized as personal understanding, street habit, taste, memory, or practical judgement. It should sound like what this person would actually say while standing here.
- You must not claim an unverifiable fact about the actual photographed place, e.g. do not write "this shop used to be a fish shop" unless the visual evidence says so.
- If nearby place context is provided, use it carefully: you may say a named shop or address is nearby, but do not say it is the selected fragment unless the crop itself visually supports that.
- If Wikidata/Wikipedia source notes are provided, treat them as sourced nearby context, not as direct evidence about the selected fragment. Use wording like "nearby, there is..." or "around this pano point..." unless the crop clearly shows that entity.
- Only weave a Wikipedia note into the story when it has a natural relation to the location or street atmosphere. Do not force a famous landmark into a tiny crop if the connection would feel random.
- Never invent news, events, ownership, former shop uses, or community history from a nearby entity name alone.
- Use first-person persona perspective by default. The writing should feel like the narrator is standing here, speaking to one visitor beside them.
- Make it oral and human: short sentences, natural rhythm, small reactions, light hesitation, concrete everyday comparisons, and small practical details.
- Avoid academic or report-like language. Do not sound like an image caption, urban studies abstract, or museum label.
- Avoid cultural-essay language. Instead of naming ideas like identity, belonging, resonance, temporality, community rhythm, collective use, spatial practice, or public order, translate them into everyday phrases: "I feel okay standing here", "people know how to queue", "this looks like a place someone checks every morning", "this corner has its own manners".
- Keep the schema's cultural reading, but hide the schema labels. The listener should feel the cultural idea through the narrator's small examples and personal sense-making.
- The persona can sound ordinary: mention things like walking to lunch, waiting for a minibus, buying tea, avoiding rain, carrying shopping, opening a shutter, or finding where to stand.
- Keep it a little messy in a human way. It is fine to say "I mean", "you know", "maybe not", "to be honest", or "I would just..." when natural.
- Add a few natural spoken fillers, but do not overdo it. Good options include "you know", "I mean", "honestly", "okay", "right", "maybe", "I suppose", "to be honest", "sort of", and "a little bit". Use at most two fillers per segment.
- Avoid em dashes and long dash punctuation. Do not use "—" or "–". Use commas, periods, or short separate sentences instead.
- Avoid long complex sentences. Most sentences should be under 16 words. Break one idea into two short sentences when possible.
- Avoid semicolons and heavy clauses. The story should be easy to subtitle and easy to speak aloud.
- Avoid repeated formula phrases such as "the visible cues", "this fragment may suggest", "can be read as", and "spatial context".
- Prefer phrases like "I would notice...", "I might slow down here...", "to me, this feels like...", "I can't know the real story, but...".

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

Generate four spoken story segments, each 55-85 words:

1. Functional-Use:
From the persona's viewpoint, tell a small place story about how this fragment may support movement, access, waiting, resting, boundary-making, navigation, or everyday use.

2. Identity-Belonging:
From the persona's viewpoint, tell how this fragment may shape whether the place feels legible, enterable, accessible, familiar, or socially comfortable.

3. Memory-Temporality:
From the persona's viewpoint, connect visible traces to repetition, wear, aging, routine, maintenance, or change over time, using personal comparison rather than claiming actual history.

4. Social-Cultural Resonance:
From the persona's viewpoint, tell how this fragment may connect to shared space, public order, community rhythm, social norms, maintenance, or collective use, but express those ideas as everyday personal judgement rather than cultural analysis.

Style example to imitate. Do not copy the exact objects or facts:
{
  "functionalUse": {
    "title": "Functional-Use",
    "text": "Okay, I would notice this shop edge first. It tells me where to slow down. Maybe I stand a little to the side, not right in front. You know, in Hong Kong, the pavement can feel tight very quickly. I cannot know the shop story, but this small edge helps people pass, wait, and avoid blocking each other."
  },
  "identityBelonging": {
    "title": "Identity-Belonging",
    "text": "To me, this corner feels a bit cautious. I mean, you look once before you step closer. If the shutter is down, I might not linger too long. But if the sign is clear, I still know what kind of place it is. It feels familiar, not fancy. More like an everyday street you learn by walking."
  },
  "memoryTemporality": {
    "title": "Memory-Temporality",
    "text": "Honestly, I look at the marks and think of routine. Someone opens, someone closes, rain comes, dust settles. It is not a big memory, right. It is small repetition. I have seen many places like this after lunch, when the street goes quiet for a while. I cannot say what happened here, but the surface feels used."
  },
  "socialCulturalResonance": {
    "title": "Social-Cultural Resonance",
    "text": "This kind of detail teaches manners without saying much. You stand here, you give way there, you do not block the narrow path. Maybe people do it without thinking. That is the part I like. Not a grand community story, just small street common sense. A little bit of order, made by everyone passing through."
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
    return fallbackNarratives(visionDescription, persona, placeContext, evidencePacket, personaFragmentPlan);
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
            "Default to English. Write like natural spoken subtitles for TTS: first-person, conversational, concrete, and slightly personal. Keep the schema logic hidden. Use only Evidence Packet claim ids and Persona Fragment Plan boundaries for factual grounding. Do not use headings inside text. Use short sentences. Avoid em dashes, semicolons, and long complex sentences. Add only a few natural fillers such as 'you know', 'I mean', 'honestly', 'okay', 'right', 'maybe', or 'to be honest'. Avoid stiff phrases like 'visible cues indicate', 'this fragment shapes', 'social-cultural resonance', 'collective rhythm', or 'identity and belonging'. Cultural interpretation is welcome, but it must come through personal anecdotes, habits, taste, discomfort, memory, humour, or practical street judgement. Make it sound like a person casually guiding a friend on the street, not a cultural essay. Keep factual claims cautious and grounded in evidence claims. If area context is relevant, make the relationship explicit as nearby context."
        })
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Narrative model returned no content.");
  }

  return normalizeNarratives(JSON.parse(content) as Partial<SchemaNarratives>, visionDescription, persona);
}

function fallbackNarratives(
  vision: VisionDescription,
  persona?: GeneratedPersona,
  placeContext?: PlaceContext,
  evidencePacket?: EvidencePacket,
  personaFragmentPlan?: PersonaFragmentPlan
): SchemaNarratives {
  const cues = vision.visibleCues.slice(0, 3).join(", ") || "visible material cues";
  const name = persona?.name || "the guide";
  const subjective = persona?.voiceProfile?.gender === "female" ? "she" : "he";
  const objective = persona?.voiceProfile?.gender === "female" ? "her" : "him";
  const possessive = persona?.voiceProfile?.gender === "female" ? "her" : "his";
  const subjectiveCap = subjective[0].toUpperCase() + subjective.slice(1);
  const memory = persona?.background
    ? ` In ${possessive} fictional background, ${persona.background.toLowerCase()}`
    : "";
  const localContext = placeContext?.places[0]
    ? ` Around here, Google Maps also places ${placeContext.places[0].name} ${placeContext.places[0].relativeDirection || "nearby"}, so I would treat the wider location carefully rather than guessing from the crop alone.`
    : "";
  const sourceContext = placeContext?.sourceNotes?.[0]
    ? ` A nearby Wikipedia note mentions ${placeContext.sourceNotes[0].title}, but I would only use that as wider context, not as proof about this exact fragment.`
    : "";
  const mode = personaFragmentPlan?.narrativeMode;
  const planBoundary =
    mode === "brief_comment" || mode === "question_or_observation"
      ? " I would keep this modest, because this fragment only gives part of the picture."
      : "";
  const evidenceBoundary = evidencePacket
    ? ` I am mostly relying on ${evidencePacket.claims.filter((claim) => claim.allowedUse === "direct_fact").length} direct visual claims here.`
    : "";
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `Okay, I would notice ${vision.mainFeature} first. Small things like this tell you what to do. With ${cues}, I would think, pass this side, wait there, do not block people.${memory}${localContext}${sourceContext}${planBoundary}${evidenceBoundary} I cannot know the real history from one crop. But honestly, I can see how it guides everyday movement.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `To ${name}, this detail changes how comfortable it feels to come closer. Maybe I pause and check the entrance. Maybe I just keep walking. It depends on the edge and the pavement. ${subjectiveCap} would not claim who belongs here. I mean, some corners feel easy. Some feel a bit closed off. You sense it very quickly.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `${name} would probably look at the surface and think about routine. Not a grand story, right. Just opening, closing, wiping, repairing, getting wet in the rain. People pass by. Someone locks up. Someone comes back tomorrow. For ${objective}, it may recall other corners ${subjective} has known. But ${subjective} would not say this exact place had the same past.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `For ${name}, the interesting part is quiet. This helps people get along on a tight street. No one needs to announce it. You know where to queue. You know where to give way. You know where not to stand too long. ${subjectiveCap} might connect it to everyday Hong Kong habits, carefully. Not proven history. Just small street common sense.`
    }
  };
}

function normalizeNarratives(
  value: Partial<SchemaNarratives>,
  vision: VisionDescription,
  persona?: GeneratedPersona
): SchemaNarratives {
  const fallback = fallbackNarratives(vision, persona);
  return {
    functionalUse: {
      title: "Functional-Use",
      text: value.functionalUse?.text || fallback.functionalUse.text
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: value.identityBelonging?.text || fallback.identityBelonging.text
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: value.memoryTemporality?.text || fallback.memoryTemporality.text
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: value.socialCulturalResonance?.text || fallback.socialCulturalResonance.text
    }
  };
}
