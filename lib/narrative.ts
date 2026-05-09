import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, PlaceContext, SchemaNarratives, VisionDescription } from "@/types";

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

Generate four spoken story segments, each 55-85 words:

1. Functional-Use:
From the persona's viewpoint, tell a small place story about how this fragment may support movement, access, waiting, resting, boundary-making, navigation, or everyday use.

2. Identity-Belonging:
From the persona's viewpoint, tell how this fragment may shape whether the place feels legible, enterable, accessible, familiar, or socially comfortable.

3. Memory-Temporality:
From the persona's viewpoint, connect visible traces to repetition, wear, aging, routine, maintenance, or change over time, using personal comparison rather than claiming actual history.

4. Social-Cultural Resonance:
From the persona's viewpoint, tell how this fragment may connect to shared space, public order, community rhythm, social norms, maintenance, or collective use, but express those ideas as everyday personal judgement rather than cultural analysis.

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
  placeContext?: PlaceContext
): Promise<SchemaNarratives> {
  const ai = createAiClient(config, "text");

  if (!ai) {
    return fallbackNarratives(visionDescription, persona, placeContext);
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
          visionDescription,
          persona,
          placeContext,
          languageStyle:
            "Default to English. Write like natural spoken subtitles for TTS: first-person, conversational, concrete, and slightly personal. Keep the schema logic hidden. Do not use headings inside text. Avoid stiff phrases like 'visible cues indicate', 'this fragment shapes', 'social-cultural resonance', 'collective rhythm', or 'identity and belonging'. Cultural interpretation is welcome, but it must come through personal anecdotes, habits, taste, discomfort, memory, humour, or practical street judgement. Make it sound like a Hong Kong person casually guiding a friend on the street, not a cultural essay. Keep factual claims cautious and grounded in observable details. If sourceNotes are relevant, paraphrase them briefly and make the relationship explicit as nearby context."
        })
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Narrative model returned no content.");
  }

  return JSON.parse(content) as SchemaNarratives;
}

function fallbackNarratives(vision: VisionDescription, persona?: GeneratedPersona, placeContext?: PlaceContext): SchemaNarratives {
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
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `I would stop at ${vision.mainFeature} first, because small things like this tell you what to do without making a big announcement. With ${cues}, I would think, okay, pass this side, wait there, don't block people.${memory}${localContext}${sourceContext} ${name} might say it feels like the kind of detail you notice while going for lunch or carrying shopping. I can't know the real history from one crop, but I can see how it guides everyday movement.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `To ${name}, this detail changes how comfortable it feels to come closer. Maybe I would pause and check where the entrance is. Maybe I would just keep walking. It depends on the edge, the condition, and how it sits beside the pavement. ${subjectiveCap} would not claim who belongs here. ${subjectiveCap} would only say: some corners feel easy, some feel a bit closed off, and you sense it very quickly.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `${name} would probably look at the surface and think about ordinary repetition. Not a grand story. Just opening, closing, wiping, repairing, getting wet in the rain, fading a little. People pass by, someone locks up, someone comes back tomorrow. For ${objective}, it may recall other shop gates or corners ${subjective} has known, but ${subjective} would not say this exact place had the same past.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `For ${name}, the interesting part is how quietly this helps people get along on a tight street. No one needs to announce it. You just sense where to queue, where to give way, where not to stand too long, where a shop edge begins. ${subjectiveCap} might connect it to everyday Hong Kong habits, carefully, not as proven history. More like, okay, this is how people avoid bumping into each other.`
    }
  };
}
