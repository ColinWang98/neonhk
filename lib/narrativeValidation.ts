import type {
  EvidencePacket,
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
  const userFacingText = userFacingNarrativeText(narratives).toLowerCase();
  if (userFacingText.includes(fact.name.toLowerCase())) return narratives;
  const spokenStory = narratives.spokenStory
    ? `${fact.sentence} ${narratives.spokenStory}`.replace(/\s+/g, " ").trim()
    : undefined;
  const subtitleBlocks = narratives.subtitleBlocks?.length
    ? [
        {
          ...narratives.subtitleBlocks[0],
          text: `${fact.sentence} ${narratives.subtitleBlocks[0].text}`.replace(/\s+/g, " ").trim(),
          groundedIn: Array.from(new Set([
            ...narratives.subtitleBlocks[0].groundedIn,
            ...(evidenceView?.primaryClaims.slice(0, 1).map((claim) => claim.id) || [])
          ]))
        },
        ...narratives.subtitleBlocks.slice(1)
      ]
    : narratives.subtitleBlocks;
  if (narratives.storyBeats?.length) {
    const [first, ...rest] = narratives.storyBeats;
    return {
      ...narratives,
      ...(spokenStory ? { spokenStory } : {}),
      ...(subtitleBlocks ? { subtitleBlocks } : {}),
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
    ...(spokenStory ? { spokenStory } : {}),
    ...(subtitleBlocks ? { subtitleBlocks } : {}),
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
  }

  const allText = primaryNarrativeText(params.narratives).toLowerCase();
  if (storyRequiresUncertaintyCue(params.narrativeBlocks, params.evidencePacket) && !hasUncertaintyCue(allText)) {
    warnings.push("Narrative uses uncertain claims but no uncertainty cue.");
  }
  if (hasMetaRefusal(allText)) {
    warnings.push("Narrative exposes evidence limits instead of turning uncertainty into a grounded persona perspective.");
  }
  if (hasStiffEvidenceLanguage(allText)) {
    warnings.push("Narrative exposes backend evidence language instead of everyday persona speech.");
  }
  if (hasTemplatedOrFormalStoryVoice(allText)) {
    warnings.push("Narrative sounds too formal, explanatory, or card-like for spoken story mode.");
  }
  if (hasThinStoryShape(primaryNarrativeText(params.narratives))) {
    warnings.push("Narrative is too short or lacks a full everyday story arc for spoken story mode.");
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
    warning.includes("too short") ||
    warning.includes("overstated as visible") ||
    warning.includes("direct cause")
  );
  return {
    status: failed ? "failed" : warnings.length ? "warning" : "passed",
    warnings,
    requiresRegeneration: failed
  };
}

function userFacingNarrativeText(narratives: SchemaNarratives) {
  return primaryNarrativeText(narratives);
}

function primaryNarrativeText(narratives: SchemaNarratives) {
  if (narratives.spokenStory?.trim()) return narratives.spokenStory.trim();
  const spokenText = narratives.spokenStory || "";
  const blockText = (narratives.subtitleBlocks || narratives.storyBeats)?.map((block) => block.text).join(" ") || "";
  const schemaText = [
    narratives.functionalUse.text,
    narratives.identityBelonging.text,
    narratives.memoryTemporality.text,
    narratives.socialCulturalResonance.text
  ].join(" ");
  return `${spokenText} ${blockText || schemaText}`.trim();
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
        sentence: factSceneSentence(name, verifier.text, verifier.allowedUse === "direct_fact" ? "direct" : "cautious")
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
        sentence: factSceneSentence(name, footprint.text, "cautious")
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
          ? factSceneSentence(name, entity.text, "direct")
          : factSceneSentence(name, entity.text, "cautious")
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
        sentence: factSceneSentence(name, text.text, "direct")
      };
    }
  }
  return undefined;
}

function factSceneSentence(name: string, sourceText: string, certainty: "direct" | "cautious") {
  const lower = `${name} ${sourceText}`.toLowerCase();
  const prefix = factOpening(name, sourceText, certainty);
  if (/\b(university|polytechnic|polyu|campus|school|college|student)\b/.test(lower)) {
    return `${prefix}, and I think of someone texting from the wrong entrance after class, asking where to meet and whether the canteen is still open.`;
  }
  if (/\b(restaurant|cafe|food|snack|egg waffle|bakery|noodle|market|茶餐|food court)\b/.test(lower)) {
    return `${prefix}, and I start thinking about whether there is time to grab one thing for a friend before the next bus or train.`;
  }
  if (/\b(pharmacy|dispensary|clinic|medical|藥房|药房)\b/.test(lower)) {
    return `${prefix}, and it feels like the kind of family errand where somebody messages, buy this quickly, then come straight back.`;
  }
  if (/\b(station|bus|tram|mtr|taxi|transport|crossing)\b/.test(lower)) {
    return `${prefix}, then I check my message again because one missed exit can turn a simple meet-up into ten extra minutes.`;
  }
  if (/\b(shop|store|mall|sign|storefront|frontage|entrance)\b/.test(lower)) {
    return `${prefix}, the sort of sign someone uses in a lazy message, wait by that shop and I will be there in five.`;
  }
  return `${prefix}, and I tie it to the small errand in my head, the message I am answering, and where I should wait without getting in the way.`;
}

function factOpening(name: string, sourceText: string, certainty: "direct" | "cautious") {
  const directOpenings = [
    `The name ${name} is what I notice first`,
    `${name} is the bit that makes me slow down for a second`,
    `I spot ${name}, and that gives this corner a handle`
  ];
  const cautiousOpenings = [
    `Around here, ${name} is the name I keep in the back of my mind`,
    `The map points me toward ${name}, so I use that name carefully`,
    `${name} is useful around here, even if I keep it a little loose`
  ];
  const openings = certainty === "direct" ? directOpenings : cautiousOpenings;
  return openings[deterministicIndex(`${name}:${sourceText}:${certainty}`, openings.length)];
}

function deterministicIndex(value: string, length: number) {
  if (length <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function confidenceForPlan(plan: PersonaFragmentPlan): NarrativeBlock["confidence"] {
  if (plan.fitLevel === "high") return "high";
  if (plan.fitLevel === "medium") return "medium";
  return "low";
}

function requiresUncertainty(ids: string[], packet: EvidencePacket) {
  return packet.claims.some((claim) => ids.includes(claim.id) && claim.uncertaintyCueRequired);
}

function storyRequiresUncertaintyCue(blocks: NarrativeBlock[], packet: EvidencePacket) {
  return blocks.some((block) =>
    block.claimType === "cautious_interpretation" ||
    block.claimType === "background_context" ||
    Boolean(block.uncertaintyCue) ||
    requiresUncertainty(block.groundedIn, packet)
  );
}

function hasUncertaintyCue(text: string) {
  return /\b(may|might|could|maybe|possibly|probably|nearby|around here|in this area|looks like|feels like|seems|seem|appears|i read it as|i treat it as|i take it as|i keep in mind|keep that name in mind|carefully|not certain|not a hard identification|points me toward|seems to point|map points|maps put|maps puts|reminds me of|suggests)\b/i.test(text) ||
    /(附近|这一带|周围|地图上|看起来|看上去|大概|可能|像是|先当作|先记住|不一定|不完全确定)/.test(text);
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
  const stiffPhrases = /\b(the timing matters more than the history|it is not a grand story|daily rhythm is the part i trust|gives me a handle on this little patch|the small rule is simple|use it first for orientation|use it for orientation|edge of the flow|one sign, one corner|stop feeling lost|keep the passage open|faster people pass|street manner i notice here)\b/i.test(text);
  return repeatedWould || cardHeading || abstractLanguage || stiffPhrases;
}

function hasThinStoryShape(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const latinWords = normalized.match(/[A-Za-z0-9']+/g)?.length || 0;
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length || 0;
  if (latinWords > 0 && latinWords < 115) return true;
  if (latinWords === 0 && cjkChars > 0 && cjkChars < 180) return true;

  const hasPersonalConnection = /\b(my|me|I|cousin|friend|coworker|colleague|landlord|child|kid|son|daughter|family|relative|classmate|customer|passenger|someone|aunt|uncle|mother|father|roommate)\b/i.test(normalized) ||
    /(我|朋友|同事|家人|親戚|亲戚|孩子|小孩|表弟|表妹|同學|同学|房東|房东|客人|乘客|有人)/.test(normalized);
  const hasComplication = /\b(late|early|rain|queue|wrong entrance|wrong exit|message|texting|busy|crowd|crowded|heavy bag|bags|wait|waiting|hungry|rush|missed|payment|octopus|delivery|shift|exam|deadline)\b/i.test(normalized) ||
    /(遲|迟|早到|下雨|排隊|排队|入口|出口|訊息|信息|短信|人多|擠|挤|等|餓|饿|趕|赶|錯過|错过|付款|八達通|八达通|外賣|外卖|班|考試|考试|deadline)/i.test(normalized);
  const hasNextAction = /\b(I go|I head|I wait|I step|I move|I send|I text|I answer|I check|I buy|I call|I cross|I ask|I follow|I leave|I walk|I look|I slow|I turn|I stay|I settle)\b/i.test(normalized) ||
    /(我走|我去|我等|我站|我挪|我發|我发|我回|我看|我買|我买|我打|我問|我问|我離開|我离开|我慢|我轉|我转|我留)/.test(normalized);

  return !(hasPersonalConnection && hasComplication && hasNextAction);
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTimeCue(text: string) {
  return /\b(older reports|past coverage|in 20\d{2}|on 20\d{2}-\d{2}-\d{2}|recent|previously|earlier)\b/i.test(text);
}
