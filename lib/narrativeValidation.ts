import type {
  EvidencePacket,
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
  personaRole?: string;
}): SchemaNarratives {
  const mainFact = topConcreteFact(params.evidencePacket, params.evidenceView);
  const visual = params.evidenceView.primaryClaims.find((claim) => claim.claimType === "visual_observation");
  const feature = mainFact?.name || params.evidencePacket.fragment.mainFeature || visualName(visual) || "this detail";
  const role = params.personaRole ? `as ${article(params.personaRole)} ${params.personaRole}` : "from here";
  return {
    functionalUse: {
      title: "Functional-Use",
      text: `${mainFact?.sentence || `This looks like ${feature}.`} ${role}, I would use it as a quick street cue. I would keep moving, check the sign, and stand to the side if I needed a second look.`
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: `${feature} gives the frontage a simple identity, but I would keep the reading modest. It helps me orient myself without pretending I know the whole place. I would compare it with streets I already know and copy the local pace.`
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: `The useful thing here is the everyday timing, not a big history lesson. People pass, shops open or close, and the pavement has to keep working. I would read this through small routines: errands, waiting, rain, and lunch-hour movement.`
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: `The social rule is practical: do not block the frontage, and do not stop in the flow. I would step aside before checking my phone. That small habit says more here than forcing a story from something merely nearby.`
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
          ? `The visible details identify ${name}.`
          : `The map and image make ${name} a possible match here.`
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
        sentence: `The map footprint and this sight line seem to point to ${name} here.`
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
          ? `The visible sign points to ${name}.`
          : `The visible sign seems to point to ${name}.`
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

function article(value: string) {
  return /^[aeiou]/i.test(value.trim()) ? "an" : "a";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTimeCue(text: string) {
  return /\b(older reports|past coverage|in 20\d{2}|on 20\d{2}-\d{2}-\d{2}|recent|previously|earlier)\b/i.test(text);
}
