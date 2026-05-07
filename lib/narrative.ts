import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SchemaNarratives, VisionDescription } from "@/types";

const narrativePrompt = `You are generating schema-based place interpretation stories for a user-selected street-level image fragment.

Use only:
1. visually observable cues from the crop
2. cautious interpretation
3. the selected fictional persona as a narrator's lens

Do not invent:
- historical facts
- demographic identities
- community stories
- cultural traditions
- ownership
- personal information
- events that cannot be verified from the image

Important distinction:
- You may let the persona speak from personal habits, memories, and comparisons, e.g. "this reminds me of the small shops near my old flat".
- You must not claim an unverifiable fact about the actual photographed place, e.g. do not write "this shop used to be a fish shop" unless the visual evidence says so.
- Use first-person or close third-person persona perspective. The writing should feel like an agent standing here and noticing the fragment, not a neutral visual report.

Use cautious language such as:
- "may suggest"
- "can be read as"
- "could help users notice"
- "appears to"
- "reminds me of"
- "I would read this as"
- "I cannot know its history, but..."

Generate four narratives, each 75-110 words:

1. Functional-Use:
From the persona's viewpoint, tell a small place story about how this fragment may support movement, access, waiting, resting, boundary-making, navigation, or everyday use.

2. Identity-Belonging:
From the persona's viewpoint, tell how this fragment may shape whether the place feels legible, enterable, accessible, familiar, or socially comfortable.

3. Memory-Temporality:
From the persona's viewpoint, connect visible traces to repetition, wear, aging, routine, maintenance, or change over time, using personal comparison rather than claiming actual history.

4. Social-Cultural Resonance:
From the persona's viewpoint, tell how this fragment may connect to shared space, public order, community rhythm, social norms, maintenance, or collective use.

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
  persona?: GeneratedPersona
): Promise<SchemaNarratives> {
  const ai = createAiClient(config, "text");

  if (!ai) {
    return fallbackNarratives(visionDescription, persona);
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
          languageStyle:
            "Default to English. Use a warm persona voice and prioritize situated story and agent perspective over neutral description. Keep factual claims cautious and grounded in visible cues."
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

function fallbackNarratives(vision: VisionDescription, persona?: GeneratedPersona): SchemaNarratives {
  const cues = vision.visibleCues.slice(0, 3).join(", ") || "visible material cues";
  const name = persona?.name || "the guide";
  const subjective = persona?.voiceProfile?.gender === "female" ? "she" : "he";
  const objective = persona?.voiceProfile?.gender === "female" ? "her" : "him";
  const possessive = persona?.voiceProfile?.gender === "female" ? "her" : "his";
  const subjectiveCap = subjective[0].toUpperCase() + subjective.slice(1);
  const memory = persona?.background
    ? ` In ${possessive} fictional background, ${persona.background.toLowerCase()}`
    : "";
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `${name} would first read ${vision.mainFeature} as a practical street detail, not just an object. The visible cues, including ${cues}, may suggest where people pass, wait, avoid crossing, or understand a boundary.${memory} ${subjectiveCap} might say it reminds ${objective} of ordinary shopfronts and walkway edges near older Hong Kong streets, while still admitting that the crop cannot prove the actual history of this place.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `From ${name}'s point of view, this fragment shapes whether the place feels approachable or slightly held back. Its form, condition, and relation to nearby surfaces may affect whether someone feels invited to step closer, slow down, or keep moving. ${subjectiveCap} would not claim who belongs here, but ${subjective} might notice how small thresholds, shutters, signs, railings, or worn surfaces make a street feel familiar, guarded, or socially readable.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `${name} might treat the visible traces as reminders of repeated routines: opening and closing, cleaning and neglect, repainting and weathering, passing by and pausing. The fragment does not prove a specific past, so ${subjective} would phrase it carefully: it looks like the kind of detail that gathers time. It may recall neighbourhood shops, stair landings, or street corners ${subjective} has known, without turning that personal memory into a fact about this exact site.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `For ${name}, this fragment can be read as part of the quiet etiquette of shared streets. It may guide how people queue, pass, keep distance, respect a shop edge, or understand what is public and what is not. ${subjectiveCap} would connect it to everyday Hong Kong habits, not as verified community history, but as a way to notice how modest street elements help people coordinate movement, attention, and small acts of mutual accommodation.`
    }
  };
}
