import type {
  EvidencePacket,
  NarrativeBlock,
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
  plan: PersonaFragmentPlan
): NarrativeBlock[] {
  return plan.activeSchemas.map((schema) => {
    const key = schemaToKey[schema];
    const groundedIn = evidencePacket.claims
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
      groundedIn: groundedIn.length ? groundedIn : plan.sourceClaimIds.slice(0, 2),
      confidence: confidenceForPlan(plan),
      uncertaintyCue: requiresUncertainty(groundedIn, evidencePacket) ? "may" : undefined
    };
  });
}

export function reinforceConcreteFacts(
  narratives: SchemaNarratives,
  evidencePacket: EvidencePacket
): SchemaNarratives {
  const fact = topConcreteFact(evidencePacket);
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
  for (const claim of backgroundOnlyClaims) {
    const candidate = extractCandidateName(claim.text);
    if (candidate && allText.includes(candidate.toLowerCase()) && /this is|this shop is|this place is|the selected|the visible/.test(allText)) {
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
    warning.includes("overstated as visible") ||
    warning.includes("direct cause")
  );
  return {
    status: failed ? "failed" : warnings.length ? "warning" : "passed",
    warnings,
    requiresRegeneration: failed
  };
}

function topConcreteFact(evidencePacket: EvidencePacket): { name: string; sentence: string } | undefined {
  const footprint = evidencePacket.claims.find((claim) =>
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
  return /\b(may|might|could|maybe|possibly|looks like|feels like|seems|seem|i cannot know|i can't know|i would guess|suggests)\b/i.test(text);
}

function extractCandidateName(text: string) {
  const match = text.match(/^(.+?) (is listed|is a Wikidata entity|near|around|reported)/i);
  return match?.[1]?.trim();
}

function hasTimeCue(text: string) {
  return /\b(older reports|past coverage|in 20\d{2}|on 20\d{2}-\d{2}-\d{2}|recent|previously|earlier)\b/i.test(text);
}
