import type { EvidenceClaim, EvidencePacket, NarrativeEvidenceView, StoryFactPlan } from "@/types";

export function buildStoryFactPlan(
  evidencePacket: EvidencePacket,
  evidenceView: NarrativeEvidenceView
): StoryFactPlan {
  const avoidFacts = [
    ...evidenceView.forbiddenVisibleNames.map((label) => ({
      label,
      reason: "The judge or evidence gate marked this name as unsafe to describe as visible."
    })),
    ...evidenceView.optionalNearbyClaims.slice(0, 3).map((claim) => ({
      claimId: claim.id,
      label: claimLabel(claim),
      reason: "Nearby or background-only context. Use only as a weak nearby note, and only if it sounds natural."
    }))
  ];

  const likelyVisibleIdentity = pickLikelyVisibleIdentity(evidenceView.primaryClaims);
  const anchors = pickAnchorClaims(evidenceView.primaryClaims, likelyVisibleIdentity?.claimId);
  const supporting = [
    ...evidenceView.primaryClaims
    .filter((claim) => !anchors.some((anchor) => anchor.id === claim.id))
    .filter((claim) => claim.allowedUse === "cautious_possible" && claim.confidence >= 0.58)
    .slice(0, 2),
    ...pickRelatedContextClaims(evidenceView, likelyVisibleIdentity?.label)
  ].slice(0, 4);

  return {
    likelyVisibleIdentity,
    anchorFacts: anchors.map((claim, index) => ({
      claimId: claim.id,
      text: storyFactText(claim),
      priority: index === 0 ? "must_use" : "should_use"
    })),
    supportingFacts: supporting.map((claim) => ({
      claimId: claim.id,
      text: storyFactText(claim),
      priority: "optional"
    })),
    avoidFacts,
    guidance: [
      "When there is a strong named place, use it early in plain speech.",
      "Turn anchor facts into something the narrator would actually say on the pavement.",
      "Use at most one extra fact if it helps the story feel specific.",
      "Sourced background can become a small life detail, never a lecture.",
      "For any place type, let the persona connect the visible clue to ordinary life: errands, family talk, food, study, work, queues, routes, waiting, repairs, delivery, visiting, or weather.",
      "Do not mention avoidFacts as visible or selected.",
      "If a fact is medium confidence, phrase it like a useful street clue rather than a confirmed identification."
    ]
  };
}

function pickRelatedContextClaims(evidenceView: NarrativeEvidenceView, likelyLabel?: string) {
  const label = normalizeText(likelyLabel || "");
  return evidenceView.optionalNearbyClaims
    .filter((claim) =>
      claim.source === "wikipedia" ||
      claim.source === "wikidata" ||
      claim.source === "place_memory" ||
      claim.source === "hk_amo" ||
      claim.source === "hk_landsd"
    )
    .filter((claim) => claim.confidence >= 0.48)
    .sort((a, b) => relatedContextScore(b, label) - relatedContextScore(a, label))
    .slice(0, 2);
}

function relatedContextScore(claim: EvidenceClaim, normalizedLabel: string) {
  const text = normalizeText(claim.text);
  return claim.confidence +
    (normalizedLabel && text.includes(normalizedLabel) ? 0.42 : 0) +
    (claim.source === "wikipedia" ? 0.18 : claim.source === "wikidata" ? 0.12 : claim.source === "place_memory" ? 0.16 : 0);
}

function pickLikelyVisibleIdentity(claims: EvidenceClaim[]): StoryFactPlan["likelyVisibleIdentity"] {
  const claim = claims.find((item) =>
    item.source === "candidate_verifier" &&
    (item.allowedUse === "direct_fact" || item.allowedUse === "cautious_possible") &&
    item.visibilityStatus !== "nearby_not_confirmed_visible" &&
    item.visibilityStatus !== "area_level_only" &&
    item.confidence >= 0.62
  ) || claims.find((item) =>
    item.allowedUse === "cautious_possible" &&
    item.confidence >= 0.72 &&
    /public|university|polytechnic|school|station|hospital|museum|campus|footprint|landmark/i.test(item.text)
  ) || claims.find((item) =>
    item.allowedUse === "direct_fact" &&
    (item.id.startsWith("ent") || item.id.startsWith("txt"))
  );

  if (!claim) return undefined;
  const label = extractNamedIdentity(claim) || claimLabel(claim);
  return {
    label,
    confidence: claim.allowedUse === "direct_fact" || claim.confidence >= 0.82 ? "high" : claim.confidence >= 0.7 ? "medium-high" : "medium",
    claimId: claim.id,
    wording: wordingForClaim(claim, label)
  };
}

function pickAnchorClaims(claims: EvidenceClaim[], identityClaimId?: string) {
  const ranked = [...claims]
    .filter((claim) =>
      claim.allowedUse === "direct_fact" ||
      claim.source === "candidate_verifier" ||
      claim.claimType === "visual_observation" ||
      (claim.allowedUse === "cautious_possible" && claim.confidence >= 0.68)
    )
    .sort((a, b) => anchorScore(b, identityClaimId) - anchorScore(a, identityClaimId));
  return ranked.slice(0, 3);
}

function anchorScore(claim: EvidenceClaim, identityClaimId?: string) {
  return claim.confidence +
    (claim.id === identityClaimId ? 0.55 : 0) +
    (claim.allowedUse === "direct_fact" ? 0.35 : 0) +
    (claim.source === "candidate_verifier" ? 0.32 : 0) +
    (claim.claimType === "visual_observation" ? 0.18 : 0) +
    (claim.visibilityStatus === "visible_confirmed" ? 0.18 : claim.visibilityStatus === "possibly_visible" ? 0.1 : 0);
}

function storyFactText(claim: EvidenceClaim) {
  const label = extractNamedIdentity(claim);
  if (label) return wordingForClaim(claim, label);
  return claim.text.replace(/\s+/g, " ").trim();
}

function wordingForClaim(claim: EvidenceClaim, label: string) {
  if (claim.allowedUse === "direct_fact") {
    return `${label} is a name the narrator can pick up naturally at the start.`;
  }
  if (claim.source === "candidate_verifier") {
    return `${label} can be used as a likely landmark in casual words, without sounding certain.`;
  }
  if (/footprint|sight line|viewing cone/i.test(claim.text)) {
    return `This view points toward ${label}, so it can be used as a careful landmark, not a hard identification.`;
  }
  return `${label} can be mentioned only if it helps the narrator's everyday story.`;
}

function claimLabel(claim: EvidenceClaim) {
  return extractNamedIdentity(claim) || claim.text.split(/[,.]/)[0]?.trim() || claim.id;
}

function extractNamedIdentity(claim: EvidenceClaim) {
  const quoted = claim.text.match(/"([^"]+)"/)?.[1]?.trim();
  if (quoted) return quoted;
  const prefix = claim.text.match(/^(.+?) (?:is listed|is a Wikidata entity|is a visual-map verifier|is retrieved|near|around|reported)/i)?.[1]?.trim();
  if (prefix) return prefix;
  const polyu = claim.text.match(/\b(?:The Hong Kong Polytechnic University|PolyU|Hong Kong Polytechnic University)\b/i)?.[0];
  return polyu;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
