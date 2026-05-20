import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeBlock,
  NarrativeEvidenceView,
  NarrativeValidation,
  PersonaFragmentPlan,
  SchemaNarratives
} from "@/types";

const schemaToKey = {
  "Functional-Use": "functionalUse",
  "Identity-Belonging": "identityBelonging",
  "Memory-Temporality": "memoryTemporality",
  "Social-Cultural Resonance": "socialCulturalResonance"
} as const;

export function buildNarrativeBlocks(
  narratives: SchemaNarratives,
  evidencePacket: EvidencePacket,
  plan: PersonaFragmentPlan,
  evidenceView?: NarrativeEvidenceView
): NarrativeBlock[] {
  const claimPool = evidenceView
    ? [...evidenceView.primaryClaims, ...evidenceView.optionalNearbyClaims]
    : evidencePacket.claims;
  return plan.activeSchemas.map((schema) => {
    const key = schemaToKey[schema];
    const groundedIn = claimPool
      .filter((claim) => claim.allowedUse !== "do_not_use" && claim.relatedSchemas.includes(schema))
      .slice(0, 3)
      .map((claim) => claim.id);
    const hasBackground = groundedIn.some((id) =>
      evidencePacket.claims.some((claim) => claim.id === id && claim.allowedUse === "background_only")
    );

    return {
      schema,
      text: narratives[key].text,
      claimType: hasBackground ? "background_context" : "persona_interpretation",
      groundedIn: groundedIn.length
        ? groundedIn
        : evidenceView
          ? evidenceView.primaryClaims.slice(0, 2).map((claim) => claim.id)
          : plan.sourceClaimIds.slice(0, 2),
      confidence: confidenceForPlan(plan),
      uncertaintyCue: requiresUncertainty(groundedIn, evidencePacket) ? "may" : undefined
    };
  });
}

export function reinforceConcreteFacts(
  narratives: SchemaNarratives,
  evidencePacket: EvidencePacket,
  evidenceView?: NarrativeEvidenceView
): SchemaNarratives {
  const fact = topConcreteFact(evidencePacket, evidenceView);
  if (!fact) return narratives;
  const allText = Object.values(narratives).map((item) => item.text).join(" ").toLowerCase();
  if (allText.includes(fact.name.toLowerCase())) return narratives;
  return {
    ...narratives,
    functionalUse: {
      ...narratives.functionalUse,
      text: `${fact.sentence} ${narratives.functionalUse.text}`.replace(/\s+/g, " ").trim()
    }
  };
}

export function validateNarrative(params: {
  narratives: SchemaNarratives;
  narrativeBlocks: NarrativeBlock[];
  evidencePacket: EvidencePacket;
  plan: PersonaFragmentPlan;
}): NarrativeValidation {
  const warnings: string[] = [];
  const claimIds = new Set(params.evidencePacket.claims.map((claim) => claim.id));
  const doNotUseIds = new Set(
    params.evidencePacket.claims.filter((claim) => claim.allowedUse === "do_not_use").map((claim) => claim.id)
  );
  const backgroundOnlyClaims = params.evidencePacket.claims.filter((claim) => claim.allowedUse === "background_only");
  const newsClaims = params.evidencePacket.claims.filter((claim) =>
    claim.claimType === "news_context" || claim.claimType === "official_notice" || claim.claimType === "social_context"
  );

  if (params.plan.narrativeMode === "disabled" && params.narrativeBlocks.length > 0) {
    warnings.push("Narrative was generated even though the persona-fragment plan is disabled.");
  }

  for (const block of params.narrativeBlocks) {
    if (!block.groundedIn.length) {
      warnings.push(`${block.schema} has no groundedIn claim ids.`);
    }
    for (const id of block.groundedIn) {
      if (!claimIds.has(id)) warnings.push(`${block.schema} references unknown claim id ${id}.`);
      if (doNotUseIds.has(id)) warnings.push(`${block.schema} uses do_not_use claim id ${id}.`);
    }
    if (block.confidence !== "high" && !hasUncertaintyCue(block.text)) {
      warnings.push(`${block.schema} has ${block.confidence} confidence but no uncertainty cue.`);
    }
  }

  const allText = Object.values(params.narratives)
    .map((item) => item.text.toLowerCase())
    .join(" ");
  if (hasMetaRefusal(allText)) {
    warnings.push("Narrative exposes evidence limits instead of turning uncertainty into a grounded persona perspective.");
  }
  if (hasStiffEvidenceLanguage(allText)) {
    warnings.push("Narrative exposes backend evidence language instead of everyday persona speech.");
  }
  const strongerCandidateNames = new Set(
    params.evidencePacket.claims
      .filter((claim) => claim.allowedUse !== "background_only" && claim.allowedUse !== "do_not_use")
      .map((claim) => extractCandidateName(claim.text)?.toLowerCase())
      .filter((name): name is string => Boolean(name))
  );
  for (const claim of backgroundOnlyClaims) {
    const candidate = extractCandidateName(claim.text);
    if (candidate && strongerCandidateNames.has(candidate.toLowerCase())) continue;
    if (candidate && sentenceOverstatesBackground(candidate, allText)) {
      warnings.push(`A background-only claim may be overstated as visible: ${candidate}.`);
    }
  }

  for (const claim of newsClaims) {
    const candidate = extractCandidateName(claim.text) || claim.sourceTitle || "news";
    if (claim.localConcernLevel === "low" && allText.includes(candidate.toLowerCase())) {
      warnings.push(`A low-concern narrator overuses local news: ${candidate}.`);
    }
    if (claim.temporalRelevance === "historical" && allText.includes(candidate.toLowerCase()) && !hasTimeCue(allText)) {
      warnings.push(`Historical news lacks a time cue: ${candidate}.`);
    }
  }

  if (newsClaims.length && /(because of|due to|caused by|as a result of).{0,80}(news|report|reported|notice|government|rthk|coverage)/i.test(allText)) {
    warnings.push("News may be written as a direct cause of the selected fragment.");
  }

  const failed = warnings.some((warning) =>
    warning.includes("do_not_use") ||
    warning.includes("disabled") ||
    warning.includes("evidence limits") ||
    warning.includes("backend evidence language") ||
    warning.includes("overstated as visible") ||
    warning.includes("direct cause")
  );
  return {
    status: failed ? "failed" : warnings.length ? "warning" : "passed",
    warnings,
    requiresRegeneration: failed
  };
}

export function buildSafeNarratives(params: {
  evidencePacket: EvidencePacket;
  evidenceView: NarrativeEvidenceView;
  persona?: GeneratedPersona;
  personaRole?: string;
}): SchemaNarratives {
  const mainFact = topConcreteFact(params.evidencePacket, params.evidenceView);
  const visual = params.evidenceView.primaryClaims.find((claim) => claim.claimType === "visual_observation");
  const feature = mainFact?.name || params.evidencePacket.fragment.mainFeature || visualName(visual) || "this detail";
  const persona = personaStreetAngle(params.persona, params.personaRole);
  const factLine = mainFact?.sentence || `This detail looks like ${feature}.`;
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `${factLine} ${persona.anchor} I would use it as a quick street cue, honestly. I would not stop in the doorway. I would check the sign, step to one side, and let people behind me keep moving.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `${feature} gives this frontage a simple handle. ${persona.comparison} That is enough for me to feel less lost. I would read the name, watch where people pause, and copy the local pace.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `The useful thing here is the daily timing. ${persona.routine} Shops open, people pass, someone slows down, then the pavement has to work again. I would read it through errands, lunch time, rain, and small waiting habits.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `The social rule is simple here: do not block the frontage. ${persona.socialRule} If I need to check my phone, I step aside first. Small moves like that matter when the pavement is busy.`
    }
  };
}

function topConcreteFact(evidencePacket: EvidencePacket, evidenceView?: NarrativeEvidenceView): { name: string; sentence: string } | undefined {
  const claims = evidenceView?.primaryClaims || evidencePacket.claims;
  const verifier = claims.find((claim) =>
    claim.id.startsWith("cv") &&
    (claim.allowedUse === "direct_fact" || claim.allowedUse === "cautious_possible") &&
    claim.visibilityStatus !== "nearby_not_confirmed_visible" &&
    claim.visibilityStatus !== "area_level_only" &&
    claim.confidence >= 0.64
  );
  if (verifier) {
    const name = extractCandidateName(verifier.text);
    if (name) {
      return {
        name,
        sentence: verifier.allowedUse === "direct_fact"
          ? `${name} is the clearest name to use for this frontage.`
          : `Maps puts ${name} around this frontage, so I would treat it as a possible landmark here.`
      };
    }
  }

  const footprint = claims.find((claim) =>
    claim.allowedUse === "cautious_possible" &&
    claim.confidence >= 0.72 &&
    /mapped building footprint intersects the selected sight line/i.test(claim.text)
  );
  if (footprint) {
    const name = extractCandidateName(footprint.text);
    if (name) {
      return {
        name,
        sentence: `The map footprint and this sight line seem to point toward ${name}.`
      };
    }
  }

  const entity = evidencePacket.claims.find((claim) => claim.id.startsWith("ent") && claim.allowedUse !== "do_not_use");
  if (entity) {
    const match = entity.text.match(/"([^"]+)"/);
    const name = match?.[1]?.trim();
    if (name) {
      return {
        name,
        sentence: entity.allowedUse === "direct_fact"
          ? `The sign gives me ${name} as the clearest name here.`
          : `The sign seems to point to ${name}.`
      };
    }
  }

  const text = evidencePacket.claims.find((claim) => claim.id.startsWith("txt"));
  if (text) {
    const match = text.text.match(/"([^"]+)"/);
    const name = match?.[1]?.trim();
    if (name && name.length <= 80) {
      return {
        name,
        sentence: `The readable text here says "${name}".`
      };
    }
  }
  return undefined;
}

function confidenceForPlan(plan: PersonaFragmentPlan): NarrativeBlock["confidence"] {
  if (plan.fitLevel === "high") return "high";
  if (plan.fitLevel === "medium") return "medium";
  return "low";
}

function personaStreetAngle(persona?: GeneratedPersona, role?: string) {
  const text = [persona?.role, persona?.userIntro, persona?.background, role].filter(Boolean).join(" ").toLowerCase();
  if (/tourist|visitor|first-time|travell?er|overseas/.test(text)) {
    return {
      anchor: "If I were visiting, I would keep it simple and use it to find my bearings.",
      comparison: "I would compare it with the kind of snack-shop or small frontage I use for directions when I travel.",
      routine: "I would notice when people buy quickly and move away quickly.",
      socialRule: "Visitors learn fast that the middle of the pavement is not a good place to hesitate."
    };
  }
  if (/temporary|short-term|recent arrival|newcomer|staying|migrant/.test(text)) {
    return {
      anchor: "Since I am only settled here for a while, I read places by practical cues first.",
      comparison: "I would compare it with streets I already know from home, then adjust to Hong Kong's faster pace.",
      routine: "After staying here a bit, I notice the small rushes: lunch, school time, rain, and people buying something fast.",
      socialRule: "For someone still learning the city, the safest move is to pause at the edge, not in the flow."
    };
  }
  if (/shop|stall|worker|security|driver|teacher|local worker/.test(text)) {
    return {
      anchor: "If I were working nearby, I would read it by how people move past it.",
      comparison: "That feels familiar in Hong Kong: a place can be useful even when you only catch the sign quickly.",
      routine: "A worker notices the practical rhythm first: deliveries, lunch breaks, shutters, and who is blocking the way.",
      socialRule: "People give way when they can, because everyone is trying to get one small thing done."
    };
  }
  if (/local|resident|neighbour|neighbor|retired|long-term/.test(text)) {
    return {
      anchor: "If this were on my usual route, I would read it very practically.",
      comparison: "On a familiar street, a shop name is often just how you remember the corner.",
      routine: "On a normal day, I would notice whether it looks busy, whether the queue spills out, and whether rain changes where people stand.",
      socialRule: "People know to leave a narrow lane open, even when they are waiting or looking at the sign."
    };
  }
  return {
    anchor: "I would keep the reading practical and small.",
    comparison: "It helps me orient myself without pretending I know everything about the place.",
    routine: "The useful clues are ordinary ones: errands, waiting, rain, lunch time, and people passing.",
    socialRule: "The safest rule is to stand aside before stopping."
  };
}

function requiresUncertainty(ids: string[], packet: EvidencePacket) {
  return packet.claims.some((claim) => ids.includes(claim.id) && claim.uncertaintyCueRequired);
}

function hasUncertaintyCue(text: string) {
  return /\b(may|might|could|maybe|possibly|looks like|feels like|seems|seem|i would guess|i would read|from what i can see|i would not treat it as certain|reminds me of|suggests)\b/i.test(text);
}

function hasMetaRefusal(text: string) {
  return /\b(not enough evidence|not enough information|insufficient evidence|i cannot know|i can't know|i cannot describe|i cannot talk about|i can't talk about|i will not speculate|i won't speculate|i will not guess|i won't guess|i will not invent|i won't invent|i don't know enough|no detailed story can be provided)\b/i.test(text) ||
    /(没有足够|证据不足|信息不足|我无法|我不能描述|不能描述|不愿猜测|不会编造|不能提供更详细)/.test(text);
}

function hasStiffEvidenceLanguage(text: string) {
  return /\b(the map and image make|visual-map verifier|candidate verifier|evidence packet|primary claims|possible match here|as a temporary-resident|as a tourist|as a local resident|frontage has a simple identity|keep the reading modest|without pretending i know the whole place)\b/i.test(text);
}

function extractCandidateName(text: string) {
  const match = text.match(/^(.+?) (is listed|is a Wikidata entity|is a visual-map verifier|is retrieved|near|around|reported)/i);
  return match?.[1]?.trim();
}

function sentenceOverstatesBackground(candidate: string, lowerText: string) {
  const normalizedCandidate = escapeRegExp(candidate.toLowerCase());
  const sentences = lowerText.split(/(?<=[.!?。！？])\s+|\n+/).filter(Boolean);
  const binding = /\b(this is|this shop is|this place is|this storefront is|this frontage is|the selected|the visible|visible storefront|visible shop|visible sign|is the selected|is the visible)\b|(?:这个|這個|这家|這家|可见|可見|框选|框選|选中|選中).{0,24}(就是|是|指向|对应|對應)/i;
  return sentences.some((sentence) => new RegExp(normalizedCandidate, "i").test(sentence) && binding.test(sentence));
}

function visualName(claim?: { text: string }) {
  const match = claim?.text.match(/"([^"]+)"/);
  return match?.[1]?.trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTimeCue(text: string) {
  return /\b(older reports|past coverage|in 20\d{2}|on 20\d{2}-\d{2}-\d{2}|recent|previously|earlier)\b/i.test(text);
}
