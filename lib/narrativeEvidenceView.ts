import type { EvidenceClaim, EvidencePacket, NarrativeEvidenceView } from "@/types";

type BuildNarrativeEvidenceViewOptions = {
  warnings?: string[];
  safeMode?: boolean;
};

export function buildNarrativeEvidenceView(
  evidencePacket: EvidencePacket,
  options: BuildNarrativeEvidenceViewOptions = {}
): NarrativeEvidenceView {
  const warningText = (options.warnings || []).join(" | ");
  const forbiddenVisibleNames = extractForbiddenVisibleNames(evidencePacket, warningText);
  const suppressedClaimIds = new Set<string>();

  const usableClaims = evidencePacket.claims.filter((claim) => {
    if (claim.allowedUse === "do_not_use" || claim.privacySensitive) return false;
    const name = claimName(claim);
    if (name && forbiddenVisibleNames.some((forbidden) => sameName(forbidden, name))) {
      suppressedClaimIds.add(claim.id);
      return false;
    }
    return true;
  });

  const primaryClaims = usableClaims
    .filter((claim) => isPrimaryClaim(claim))
    .sort((a, b) => claimPriority(b) - claimPriority(a))
    .slice(0, options.safeMode ? 8 : 14);

  const optionalNearbyClaims = options.safeMode
    ? []
    : usableClaims
        .filter((claim) => isOptionalNearbyClaim(claim) && !primaryClaims.some((primary) => primary.id === claim.id))
        .sort((a, b) => claimPriority(b) - claimPriority(a))
        .slice(0, 5);

  return {
    fragment: evidencePacket.fragment,
    primaryClaims,
    optionalNearbyClaims,
    suppressedClaimIds: Array.from(suppressedClaimIds),
    forbiddenVisibleNames,
    guidance: [
      "Use primaryClaims for factual statements about the selected fragment.",
      "optionalNearbyClaims are optional area context only. They may be omitted.",
      "Never describe optionalNearbyClaims as the visible or selected object.",
      "Do not mention forbiddenVisibleNames as visible in the selected fragment.",
      "If a nearby name creates awkward wording, skip it and keep the story practical."
    ]
  };
}

export function extractForbiddenVisibleNames(evidencePacket: EvidencePacket, warningText: string): string[] {
  const names = new Set<string>();
  for (const match of warningText.matchAll(/overstated as visible:\s*([^.|]+)/gi)) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  for (const match of warningText.matchAll(/visible[^.|]*?as\s+(?:the\s+)?([^,.|]+)/gi)) {
    const name = match[1]?.trim();
    if (name && name.length >= 3 && name.length <= 100) names.add(cleanWarningName(name));
  }
  for (const claim of evidencePacket.claims) {
    if (claim.allowedUse !== "background_only") continue;
    const name = claimName(claim);
    if (name && warningContainsName(warningText, name)) names.add(name);
  }
  return Array.from(names).map(cleanWarningName).filter(Boolean);
}

function isPrimaryClaim(claim: EvidenceClaim) {
  if (claim.allowedUse === "direct_fact") return true;
  if (claim.source === "candidate_verifier" && claim.allowedUse === "cautious_possible" && claim.confidence >= 0.58) return true;
  if (claim.allowedUse === "cautious_possible" && claim.visibilityStatus === "possibly_visible" && claim.confidence >= 0.62) return true;
  if (claim.claimType === "visual_observation" || claim.claimType === "pano_metadata") return true;
  return false;
}

function isOptionalNearbyClaim(claim: EvidenceClaim) {
  return claim.allowedUse === "background_only" ||
    claim.visibilityStatus === "nearby_not_confirmed_visible" ||
    claim.visibilityStatus === "area_level_only";
}

function claimPriority(claim: EvidenceClaim) {
  const sourceScore =
    claim.source === "candidate_verifier" ? 0.32 :
    claim.source === "vision_model" ? 0.26 :
    claim.source === "hk_amo" ? 0.2 :
    claim.source === "hk_fehd" ? 0.16 :
    claim.source === "wikidata" || claim.source === "wikipedia" ? 0.1 :
    0.06;
  const useScore =
    claim.allowedUse === "direct_fact" ? 0.36 :
    claim.allowedUse === "cautious_possible" ? 0.22 :
    claim.allowedUse === "background_only" ? 0.06 :
    0;
  const visibilityScore =
    claim.visibilityStatus === "visible_confirmed" ? 0.24 :
    claim.visibilityStatus === "possibly_visible" ? 0.16 :
    claim.visibilityStatus === "nearby_not_confirmed_visible" ? 0.04 :
    0;
  return claim.confidence + sourceScore + useScore + visibilityScore;
}

function warningContainsName(warningText: string, name: string) {
  const normalizedWarning = normalizeName(warningText);
  const normalizedName = normalizeName(name);
  if (!normalizedName) return false;
  if (normalizedWarning.includes(normalizedName)) return true;
  const englishPart = normalizedName.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim();
  return englishPart.length >= 4 && normalizedWarning.includes(englishPart);
}

function sameName(a: string, b: string) {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  return Boolean(normalizedA && normalizedB && (normalizedA === normalizedB || normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)));
}

function claimName(claim: EvidenceClaim) {
  return extractCandidateName(claim.text);
}

function extractCandidateName(text: string) {
  const match = text.match(/^(.+?) (is listed|is a Wikidata entity|is a visual-map verifier|is retrieved|near|around|reported)/i);
  return match?.[1]?.trim();
}

function cleanWarningName(value: string) {
  return value
    .replace(/\bwhich\b.*$/i, "")
    .replace(/\bthat\b.*$/i, "")
    .replace(/\bas\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
