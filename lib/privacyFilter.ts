import type { PrivacyRisk, VisionDescription } from "@/types";

export function shouldBlockFragment(risk?: PrivacyRisk) {
  return risk?.riskLevel === "high";
}

export function fallbackVisionDescription(): VisionDescription {
  return {
    mainFeature: "selected street-level image fragment",
    fragmentCategory: "urban detail",
    spatialContext: "part of the visible street scene",
    visibleCues: ["selected crop", "street-level context", "visible spatial detail"],
    possibleEverydayUses: ["supporting movement", "marking access", "organizing everyday use"],
    privacyRisk: {
      containsFace: false,
      containsLicensePlate: false,
      containsPrivateInterior: false,
      riskLevel: "low"
    },
    uncertainty:
      "Automated visual analysis is unavailable, so this description remains generic and should be checked manually."
  };
}
