import type {
  EvidencePacket,
  GeneratedPersona,
  NarrativeBlock,
  NarrativeEvidenceView,
  NarrativeValidation,
  PersonaFragmentPlan,
  SchemaName,
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
  if (narratives.subtitleBlocks?.length) {
    return narratives.subtitleBlocks.map((block) => ({
      ...block,
      title: undefined,
      groundedIn: block.groundedIn.length
        ? block.groundedIn
        : evidenceView
          ? evidenceView.primaryClaims.slice(0, 2).map((claim) => claim.id)
          : plan.sourceClaimIds.slice(0, 2),
      confidence: block.confidence || confidenceForPlan(plan)
    }));
  }
  if (narratives.storyBeats?.length) {
    return narratives.storyBeats.map((block) => ({
      ...block,
      title: undefined,
      groundedIn: block.groundedIn.length
        ? block.groundedIn
        : evidenceView
          ? evidenceView.primaryClaims.slice(0, 2).map((claim) => claim.id)
          : plan.sourceClaimIds.slice(0, 2),
      confidence: block.confidence || confidenceForPlan(plan)
    }));
  }
  const claimPool = evidenceView
    ? [...evidenceView.primaryClaims, ...evidenceView.optionalNearbyClaims]
    : evidencePacket.claims;
  return orderedSchemasForNarrative(plan, evidencePacket, evidenceView).map((schema) => {
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

function orderedSchemasForNarrative(
  plan: PersonaFragmentPlan,
  evidencePacket: EvidencePacket,
  evidenceView?: NarrativeEvidenceView
): SchemaName[] {
  if (plan.narrativeMode === "disabled") return [];
  const activeSchemas = plan.activeSchemas.length
    ? plan.activeSchemas
    : ([
        "Functional-Use",
        "Identity-Belonging",
        "Memory-Temporality",
        "Social-Cultural Resonance"
      ] satisfies SchemaName[]);
  const seed = `${plan.fragmentId}:${plan.personaId || "default"}:${plan.recommendedStance}`;
  const claims = evidenceView
    ? [...evidenceView.primaryClaims, ...evidenceView.optionalNearbyClaims]
    : evidencePacket.claims;

  return [...activeSchemas]
    .sort((a, b) => schemaScore(b, claims, plan, evidencePacket, seed) - schemaScore(a, claims, plan, evidencePacket, seed))
    .slice(0, 4);
}

function schemaScore(
  schema: SchemaName,
  claims: EvidencePacket["claims"],
  plan: PersonaFragmentPlan,
  evidencePacket: EvidencePacket,
  seed: string
) {
  const claimSupport = claims
    .filter((claim) => claim.allowedUse !== "do_not_use" && claim.relatedSchemas.includes(schema))
    .reduce((sum, claim) => {
      const useWeight = claim.allowedUse === "direct_fact" ? 0.34 : claim.allowedUse === "cautious_possible" ? 0.22 : 0.08;
      const sourceWeight = claim.source === "candidate_verifier" ? 0.22 : claim.source === "vision_model" ? 0.16 : claim.source === "wikipedia" || claim.source === "wikidata" ? 0.12 : 0.06;
      return sum + claim.confidence * 0.2 + useWeight + sourceWeight;
    }, 0);
  const affordanceSupport =
    schema === "Functional-Use" && evidencePacket.storyAffordances.supportsFunctionalUse ? 0.16 :
    schema === "Identity-Belonging" && evidencePacket.storyAffordances.supportsIdentityBelonging ? 0.16 :
    schema === "Memory-Temporality" && evidencePacket.storyAffordances.supportsMemoryTemporality ? 0.16 :
    schema === "Social-Cultural Resonance" && evidencePacket.storyAffordances.supportsSocialCulturalResonance ? 0.16 :
    0;
  return claimSupport + affordanceSupport + stanceSchemaWeight(schema, plan) + deterministicJitter(`${seed}:${schema}`);
}

function stanceSchemaWeight(schema: SchemaName, plan: PersonaFragmentPlan) {
  const stance = plan.recommendedStance;
  if (stance === "outsider_questioning") {
    return schema === "Identity-Belonging" ? 0.23 : schema === "Functional-Use" ? 0.18 : schema === "Social-Cultural Resonance" ? 0.1 : 0.04;
  }
  if (stance === "practical_commentary") {
    return schema === "Functional-Use" ? 0.23 : schema === "Social-Cultural Resonance" ? 0.2 : schema === "Memory-Temporality" ? 0.09 : 0.05;
  }
  if (stance === "public_context_explanation") {
    return schema === "Functional-Use" ? 0.19 : schema === "Identity-Belonging" ? 0.18 : schema === "Memory-Temporality" ? 0.14 : 0.08;
  }
  return schema === "Memory-Temporality" ? 0.18 : schema === "Functional-Use" ? 0.14 : schema === "Identity-Belonging" ? 0.12 : 0.1;
}

function deterministicJitter(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000 * 0.08;
}

export function reinforceConcreteFacts(
  narratives: SchemaNarratives,
  evidencePacket: EvidencePacket,
  evidenceView?: NarrativeEvidenceView
): SchemaNarratives {
  const fact = topConcreteFact(evidencePacket, evidenceView);
  if (!fact) return narratives;
  const allText = narrativeText(narratives).toLowerCase();
  if (allText.includes(fact.name.toLowerCase())) return narratives;
  if (narratives.storyBeats?.length) {
    const [first, ...rest] = narratives.storyBeats;
    return {
      ...narratives,
      storyBeats: [
        {
          ...first,
          text: `${fact.sentence} ${first.text}`.replace(/\s+/g, " ").trim(),
          groundedIn: Array.from(new Set([...first.groundedIn, ...(evidenceView?.primaryClaims.slice(0, 1).map((claim) => claim.id) || [])]))
        },
        ...rest
      ],
      functionalUse: {
        ...narratives.functionalUse,
        text: `${fact.sentence} ${narratives.functionalUse.text}`.replace(/\s+/g, " ").trim()
      }
    };
  }
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

  const allText = narrativeText(params.narratives).toLowerCase();
  if (hasMetaRefusal(allText)) {
    warnings.push("Narrative exposes evidence limits instead of turning uncertainty into a grounded persona perspective.");
  }
  if (hasStiffEvidenceLanguage(allText)) {
    warnings.push("Narrative exposes backend evidence language instead of everyday persona speech.");
  }
  if (hasTemplatedOrFormalStoryVoice(allText)) {
    warnings.push("Narrative sounds too formal, explanatory, or card-like for spoken story mode.");
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
    warning.includes("too formal") ||
    warning.includes("overstated as visible") ||
    warning.includes("direct cause")
  );
  return {
    status: failed ? "failed" : warnings.length ? "warning" : "passed",
    warnings,
    requiresRegeneration: failed
  };
}

function narrativeText(narratives: SchemaNarratives) {
  const schemaText = [
    narratives.spokenStory,
    narratives.functionalUse.text,
    narratives.identityBelonging.text,
    narratives.memoryTemporality.text,
    narratives.socialCulturalResonance.text
  ];
  const beatText = (narratives.subtitleBlocks || narratives.storyBeats)?.map((block) => block.text) || [];
  return [...schemaText, ...beatText].join(" ");
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
  const detail = feature === "this detail" ? "this selected detail" : feature;
  const factLine = mainFact?.sentence || `Okay, ${detail} is the clue I use first here.`;
  const story = [
    `${factLine} ${persona.anchor}`,
    `${persona.connection(detail)} ${persona.comparison}`,
    `${persona.routine} ${persona.socialRule}`
  ].join(" ");
  const subtitleBlocks = safeSubtitleBlocks(story, params.evidenceView, mainFact?.name ? "medium" : "low");
  return {
    spokenStory: story,
    subtitleBlocks,
    storyBeats: subtitleBlocks,
    functionalUse: {
      title: "Functional-Use",
      text: subtitleBlocks[0]?.text || story
    },
    identityBelonging: {
      title: "Identity-Belonging",
      text: subtitleBlocks[1]?.text || story
    },
    memoryTemporality: {
      title: "Memory-Temporality",
      text: subtitleBlocks[2]?.text || story
    },
    socialCulturalResonance: {
      title: "Social-Cultural Resonance",
      text: subtitleBlocks[3]?.text || story
    }
  };
}

function safeSubtitleBlocks(
  story: string,
  evidenceView: NarrativeEvidenceView,
  confidence: NarrativeBlock["confidence"]
): NarrativeBlock[] {
  const claimIds = evidenceView.primaryClaims.slice(0, 2).map((claim) => claim.id);
  const schemas = [
    "Functional-Use",
    "Identity-Belonging",
    "Memory-Temporality",
    "Social-Cultural Resonance"
  ] as const;
  return story
    .split(/(?<=[.!?。！？])\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      schema: schemas[index % schemas.length],
      text,
      claimType: index === 0 ? "cautious_interpretation" : "persona_interpretation",
      groundedIn: claimIds,
      confidence
    }));
}

function topConcreteFact(evidencePacket: EvidencePacket, evidenceView?: NarrativeEvidenceView): { name: string; sentence: string } | undefined {
  const claims = evidenceView?.primaryClaims || evidencePacket.claims;
  const verifier = claims.find((claim) =>
    claim.id.startsWith("cv") &&
    (claim.allowedUse === "direct_fact" || claim.allowedUse === "cautious_possible") &&
    claim.visibilityStatus !== "nearby_not_confirmed_visible" &&
    claim.visibilityStatus !== "area_level_only" &&
    (claim.allowedUse === "direct_fact" || claim.confidence >= 0.78)
  );
  if (verifier) {
    const name = extractCandidateName(verifier.text);
    if (name) {
      return {
        name,
        sentence: verifier.allowedUse === "direct_fact"
          ? `Okay, ${name} is the name I hold onto here.`
          : `Maps puts ${name} around here, so I use that name carefully.`
      };
    }
  }

  const footprint = claims.find((claim) =>
    claim.allowedUse === "cautious_possible" &&
    claim.confidence >= 0.82 &&
    /mapped building footprint intersects the selected sight line/i.test(claim.text)
  );
  if (footprint) {
    const name = extractCandidateName(footprint.text);
    if (name) {
      return {
        name,
        sentence: `The map footprint points me toward ${name}, so I keep that in mind.`
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
          ? `The sign gives me ${name} as the name to follow.`
          : `The sign seems to point toward ${name}.`
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
        sentence: `The readable text here says "${name}", so that is what I notice first.`
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
      anchor: "I use big signs first, then I slow down at the edge.",
      connection: (detail: string) => `A name like ${detail} is the kind of thing I text to a friend when we are trying to meet.`,
      comparison: "Back home I might use street numbers, but here I trust shop signs, campus names, and where people pause.",
      routine: "I notice the small bursts first, people buying quickly, checking directions, then moving away.",
      socialRule: "I have learned not to stop in the middle of the pavement."
    };
  }
  if (/temporary|short-term|recent arrival|newcomer|staying|migrant/.test(text)) {
    return {
      anchor: "After staying here a while, I read places by practical cues first.",
      connection: (detail: string) => `A place like ${detail} becomes part of my small map, where to wait, where to duck in, where not to stand.`,
      comparison: "I compare it with streets I knew before, then adjust to Hong Kong's faster pace.",
      routine: "After a few weeks, I start noticing lunch, school time, rain, and people buying something fast.",
      socialRule: "I pause at the edge first. That is the safest move while I am still learning the city."
    };
  }
  if (/shop|stall|worker|security|driver|teacher|local worker/.test(text)) {
    return {
      anchor: "When I work near streets like this, I read them by how people move past.",
      connection: (detail: string) => `${detail} is useful in a very normal way: someone says meet me there, pick this up, wait near that sign.`,
      comparison: "That feels familiar in Hong Kong. A place can be useful even when you only catch the sign quickly.",
      routine: "I notice deliveries, lunch breaks, shutters, and who is blocking the way.",
      socialRule: "People give way when they can, because everyone is trying to get one small thing done."
    };
  }
  if (/local|resident|neighbour|neighbor|retired|long-term/.test(text)) {
    return {
      anchor: "On my usual route, I read a frontage like this very practically.",
      connection: (detail: string) => `${detail} is the sort of name I use when giving directions to family, not the full address.`,
      comparison: "On a familiar street, a shop name is often just how you remember the corner.",
      routine: "On a normal day, I notice whether it is busy, whether a queue spills out, and where people stand when it rains.",
      socialRule: "People know to leave a narrow lane open, even when they are waiting or looking at the sign."
    };
  }
  return {
    anchor: "I keep my reading practical and small.",
    connection: (detail: string) => `${detail} gives me one simple thing to hold onto before I decide where to stand.`,
    comparison: "It helps me orient myself before I try to understand the wider place.",
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
  return /\b(the map and image make|visual-map verifier|candidate verifier|evidence packet|primary claims|possible match here|as a temporary-resident|as a tourist|as a local resident|frontage has a simple identity|keep the reading modest|without pretending i know the whole place|if i were visiting|if i were working nearby|if this were on my usual route|i would keep it simple)\b/i.test(text);
}

function hasTemplatedOrFormalStoryVoice(text: string) {
  const repeatedWould = (text.match(/\bi would\b/gi) || []).length >= 4;
  const cardHeading = /\b(what catches my eye|what it brings up|a time of day|how people move here|how i use it|first impression|street timing|street manners|everyday use|shared space)\b/i.test(text);
  const abstractLanguage = /\b(identity|rhythm|social meaning|urban texture|public-facing environment|resonance|threshold|sense of belonging|layers of meaning|spatial context)\b/i.test(text);
  const stiffPhrases = /\b(the timing matters more than the history|it is not a grand story|daily rhythm is the part i trust|gives me a handle on this little patch|the small rule is simple)\b/i.test(text);
  return repeatedWould || cardHeading || abstractLanguage || stiffPhrases;
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
