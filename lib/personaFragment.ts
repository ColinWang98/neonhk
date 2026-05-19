import { inferFragmentAffordances } from "@/lib/evidence";
import type {
  EvidencePacket,
  FragmentAffordance,
  GeneratedPersona,
  PersonaFragmentPlan,
  SchemaName,
  VisionDescription
} from "@/types";

export function buildPersonaFragmentPlan(params: {
  fragmentId: string;
  persona?: GeneratedPersona;
  visionDescription: VisionDescription;
  evidencePacket: EvidencePacket;
}): PersonaFragmentPlan {
  const affordances = inferFragmentAffordances(params.visionDescription);
  const lens = lensForPersona(params.persona);
  const overlap = ratioOverlap(affordances, lens.strong);
  const weakOverlap = ratioOverlap(affordances, lens.weak);
  const evidenceSupport = evidenceSupportScore(params.evidencePacket);
  const schemaSupport = schemaSupportScore(params.evidencePacket, lens.preferredSchemas);
  const visualConfidence = params.evidencePacket.fragment.uncertainty === "low" ? 0.82 : params.evidencePacket.fragment.uncertainty === "medium" ? 0.62 : 0.38;
  const privacyPenalty = affordances.includes("private_sensitive") ? 0.35 : 0;
  const unsupportedMemoryPenalty =
    lens.preferredSchemas.includes("Memory-Temporality") &&
    !params.evidencePacket.storyAffordances.supportsMemoryTemporality
      ? 0.12
      : 0;

  const fitScore = clamp(
    0.4 * overlap + 0.12 * weakOverlap + 0.25 * evidenceSupport + 0.2 * schemaSupport + 0.15 * visualConfidence -
      privacyPenalty -
      unsupportedMemoryPenalty,
    0,
    1
  );
  const fitLevel = fitLevelForScore(fitScore);
  const narrativeMode = narrativeModeForFit(fitScore, affordances, params.evidencePacket.fragment.privacyRisk);
  const localConcernLevel = localConcernLevelForPersona(params.persona, lens.stance);
  const activeSchemas = activeSchemasForPlan(params.evidencePacket, lens.preferredSchemas, narrativeMode);
  const sourceClaimIds = params.evidencePacket.claims
    .filter((claim) => claim.allowedUse !== "do_not_use")
    .filter((claim) => localConcernLevel !== "low" || !isNewsClaim(claim))
    .filter((claim) => activeSchemas.some((schema) => claim.relatedSchemas.includes(schema)))
    .slice(0, 6)
    .map((claim) => claim.id);

  return {
    planId: `pfp_${params.fragmentId}_${params.persona?.id || "default"}`,
    fragmentId: params.fragmentId,
    personaId: params.persona?.id,
    fitScore,
    fitLevel,
    narrativeMode,
    activeSchemas,
    personaCanSpeakAbout: canSpeakAbout(affordances, lens),
    personaMustAvoid: mustAvoid(params.evidencePacket, lens),
    recommendedStance: lens.stance,
    sourceClaimIds,
    affordances,
    localConcernLevel,
    reason: planReason(fitLevel, affordances, params.evidencePacket)
  };
}

function lensForPersona(persona?: GeneratedPersona) {
  const identityText = [persona?.role, persona?.background, persona?.userIntro, persona?.voiceHint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const lensText = [identityText, persona?.interpretiveLens, persona?.promptInstruction]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const visitor = /visitor|tourist|first-time|travell?ing|overseas/.test(identityText);
  const returning = /return|temporary|staying|regular|often|nearby/.test(identityText);
  const commercial = /shop|stall|market|commercial|worker|assistant|restaurant|cafe/.test(identityText);
  const teacher = /teacher|school|student|wayfinding|entrance|threshold|access/.test(lensText);
  const routine = /routine|waiting|maintenance|delivery|queue|daily|resident|local/.test(identityText);

  if (visitor) {
    return {
      strong: ["wayfinding", "mobility", "commercial"] as FragmentAffordance[],
      weak: ["cultural", "heritage", "public_facility"] as FragmentAffordance[],
      preferredSchemas: ["Functional-Use", "Identity-Belonging"] as SchemaName[],
      stance: "outsider_questioning" as const
    };
  }
  if (returning) {
    return {
      strong: ["wayfinding", "mobility", "commercial", "public_facility"] as FragmentAffordance[],
      weak: ["heritage", "social_gathering"] as FragmentAffordance[],
      preferredSchemas: ["Functional-Use", "Identity-Belonging"] as SchemaName[],
      stance: "cautious_interpretation" as const
    };
  }
  if (commercial) {
    return {
      strong: ["commercial", "social_gathering", "mobility"] as FragmentAffordance[],
      weak: ["infrastructure", "wayfinding"] as FragmentAffordance[],
      preferredSchemas: ["Functional-Use", "Social-Cultural Resonance"] as SchemaName[],
      stance: "practical_commentary" as const
    };
  }
  if (teacher) {
    return {
      strong: ["wayfinding", "mobility", "public_facility", "infrastructure"] as FragmentAffordance[],
      weak: ["commercial", "social_gathering"] as FragmentAffordance[],
      preferredSchemas: ["Functional-Use", "Identity-Belonging"] as SchemaName[],
      stance: "public_context_explanation" as const
    };
  }
  if (routine) {
    return {
      strong: ["commercial", "social_gathering", "infrastructure", "mobility"] as FragmentAffordance[],
      weak: ["heritage", "residential"] as FragmentAffordance[],
      preferredSchemas: ["Memory-Temporality", "Social-Cultural Resonance"] as SchemaName[],
      stance: "cautious_interpretation" as const
    };
  }
  return {
    strong: ["mobility", "wayfinding", "commercial", "infrastructure"] as FragmentAffordance[],
    weak: ["social_gathering", "public_facility"] as FragmentAffordance[],
    preferredSchemas: ["Functional-Use", "Identity-Belonging"] as SchemaName[],
    stance: "cautious_interpretation" as const
  };
}

function activeSchemasForPlan(
  evidencePacket: EvidencePacket,
  preferredSchemas: SchemaName[],
  narrativeMode: PersonaFragmentPlan["narrativeMode"]
) {
  if (narrativeMode === "disabled") return [];
  const allSchemas: SchemaName[] = [
    "Functional-Use",
    "Identity-Belonging",
    "Memory-Temporality",
    "Social-Cultural Resonance"
  ];
  const enabled: SchemaName[] = [];
  const affordances = evidencePacket.storyAffordances;
  if (affordances.supportsFunctionalUse) enabled.push("Functional-Use");
  if (affordances.supportsIdentityBelonging) enabled.push("Identity-Belonging");
  if (affordances.supportsMemoryTemporality) enabled.push("Memory-Temporality");
  if (affordances.supportsSocialCulturalResonance) enabled.push("Social-Cultural Resonance");

  const prioritized = [
    ...preferredSchemas.filter((schema) => enabled.includes(schema)),
    ...enabled.filter((schema) => !preferredSchemas.includes(schema)),
    ...allSchemas.filter((schema) => !enabled.includes(schema) && !preferredSchemas.includes(schema)),
    ...preferredSchemas.filter((schema) => !enabled.includes(schema))
  ];
  return Array.from(new Set(prioritized)).slice(0, 4);
}

function evidenceSupportScore(packet: EvidencePacket) {
  const usable = packet.claims.filter((claim) => claim.allowedUse !== "do_not_use");
  const direct = usable.filter((claim) => claim.allowedUse === "direct_fact").length;
  return clamp((direct * 0.24 + usable.length * 0.08), 0, 1);
}

function schemaSupportScore(packet: EvidencePacket, schemas: SchemaName[]) {
  const supported = schemas.filter((schema) =>
    packet.claims.some((claim) => claim.allowedUse !== "do_not_use" && claim.relatedSchemas.includes(schema))
  );
  return schemas.length ? supported.length / schemas.length : 0.5;
}

function ratioOverlap(values: FragmentAffordance[], target: FragmentAffordance[]) {
  if (target.length === 0) return 0;
  return values.filter((value) => target.includes(value)).length / target.length;
}

function fitLevelForScore(score: number): PersonaFragmentPlan["fitLevel"] {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  if (score >= 0.3) return "low";
  return "not_applicable";
}

function narrativeModeForFit(
  score: number,
  affordances: FragmentAffordance[],
  privacyRisk: EvidencePacket["fragment"]["privacyRisk"]
): PersonaFragmentPlan["narrativeMode"] {
  if (affordances.includes("private_sensitive") || privacyRisk === "high") return "disabled";
  if (score >= 0.75) return "full_interpretation";
  if (score >= 0.5) return "brief_comment";
  return "question_or_observation";
}

function canSpeakAbout(affordances: FragmentAffordance[], lens: ReturnType<typeof lensForPersona>) {
  const topics = new Set<string>();
  if (affordances.includes("wayfinding")) topics.add("how signs or visible cues help a person find their way");
  if (affordances.includes("mobility")) topics.add("movement, passing, waiting, and where to stand");
  if (affordances.includes("commercial")) topics.add("street-facing shops and everyday errands");
  if (affordances.includes("infrastructure")) topics.add("small public rules created by rails, pipes, barriers, or civic fixtures");
  if (lens.stance === "outsider_questioning") topics.add("visitor uncertainty and first-time orientation");
  if (lens.stance === "outsider_questioning") topics.add("careful comparisons with places the visitor already knows");
  if (lens.stance === "cautious_interpretation") topics.add("temporary resident or newcomer comparisons without claiming local memory");
  if (lens.stance === "practical_commentary") topics.add("practical use and street manners");
  return Array.from(topics).slice(0, 5);
}

function mustAvoid(packet: EvidencePacket, lens: ReturnType<typeof lensForPersona>) {
  const avoid = new Set<string>(packet.blockedTopics);
  avoid.add("claiming that a nearby place is the selected fragment unless evidence says it is visible");
  avoid.add("inventing old shop uses, community stories, or ownership");
  avoid.add("claiming that a news item explains the selected fragment's current condition");
  if (!packet.storyAffordances.supportsMemoryTemporality || lens.stance === "outsider_questioning") {
    avoid.add("claiming long-term local memory about this exact place");
    avoid.add("bringing local news into a tourist-style story unless it is only brief area background");
  }
  return Array.from(avoid);
}

function planReason(
  fitLevel: PersonaFragmentPlan["fitLevel"],
  affordances: FragmentAffordance[],
  packet: EvidencePacket
) {
  return `Fit is ${fitLevel} because the fragment affords ${affordances.join(", ")} and has ${packet.claims.filter((claim) => claim.allowedUse !== "do_not_use").length} usable evidence claims.`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function localConcernLevelForPersona(
  persona: GeneratedPersona | undefined,
  stance: ReturnType<typeof lensForPersona>["stance"]
): PersonaFragmentPlan["localConcernLevel"] {
  const identityText = [persona?.role, persona?.background, persona?.userIntro, persona?.voiceHint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/visitor|tourist|first-time|overseas|travell?ing/.test(identityText) || stance === "outsider_questioning") return "low";
  if (/resident|local|neighbour|neighbor|shop|stall|worker|retired|retiree|teacher|driver|security|estate|district/.test(identityText)) {
    return "high";
  }
  if (/return|temporary|staying|regular|often|nearby/.test(identityText)) return "medium";
  return "medium";
}

function isNewsClaim(claim: EvidencePacket["claims"][number]) {
  return claim.claimType === "news_context" || claim.claimType === "official_notice" || claim.claimType === "social_context";
}
