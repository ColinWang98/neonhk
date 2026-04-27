import OpenAI from "openai";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { SchemaNarratives, VisionDescription } from "@/types";

const narrativePrompt = `You are generating schema-based place interpretation narratives for a user-selected street-level image fragment.

Use only:
1. visually observable cues from the crop
2. cautious interpretation

Do not invent:
- historical facts
- demographic identities
- community stories
- cultural traditions
- ownership
- personal information
- events that cannot be verified from the image

Use cautious language such as:
- "may suggest"
- "can be read as"
- "could help users notice"
- "appears to"

Generate four narratives, each 60-90 words:

1. Functional-Use:
Explain how this fragment may support movement, access, waiting, resting, boundary-making, navigation, or everyday use.

2. Identity-Belonging:
Explain how this fragment may shape whether the place feels legible, enterable, accessible, familiar, or socially comfortable.

3. Memory-Temporality:
Explain how visible traces may suggest repetition, wear, aging, routine, maintenance, or change over time.

4. Social-Cultural Resonance:
Explain how this fragment may connect to shared space, public order, community rhythm, social norms, maintenance, or collective use.

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
  config: RuntimeApiConfig = {}
): Promise<SchemaNarratives> {
  const apiKey = config.aiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = config.aiBaseUrl || process.env.AI_BASE_URL || "https://api.deepseek.com";

  if (!apiKey) {
    return fallbackNarratives(visionDescription);
  }

  const client = new OpenAI({ apiKey, baseURL });
  const response = await client.chat.completions.create({
    model: config.llmModel || process.env.LLM_MODEL || "deepseek-v4-flash",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: narrativePrompt },
      { role: "user", content: JSON.stringify({ visionDescription }) }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Narrative model returned no content.");
  }

  return JSON.parse(content) as SchemaNarratives;
}

function fallbackNarratives(vision: VisionDescription): SchemaNarratives {
  const cues = vision.visibleCues.slice(0, 3).join(", ") || "visible material cues";
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `This fragment appears to center on ${vision.mainFeature}. The visible cues, including ${cues}, may suggest how the place supports movement, access, boundary-making, or everyday orientation. Because only the crop is available, the interpretation stays cautious and focuses on how the detail could help people read where to move, pause, or avoid crossing.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `The fragment can be read as part of how the place becomes legible and approachable. Its form, condition, and relation to nearby surfaces may affect whether the setting feels enterable, familiar, or socially comfortable. The crop does not verify who uses the place, but it could help users notice how small spatial details shape a sense of access and belonging.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `Visible traces in the selected area may suggest repeated routines, maintenance, weathering, or gradual change over time. The fragment does not prove a specific history, but its surfaces and arrangement can invite attention to how ordinary use leaves marks. It could help users consider the place as something maintained and encountered repeatedly rather than as a static scene.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `This detail may connect to shared expectations about public order, access, and collective use. Without inferring community facts, the fragment can be interpreted as part of the practical rules that organize how people move through or share the space. It could help users notice how small urban elements quietly support common rhythms and social coordination.`
    }
  };
}
