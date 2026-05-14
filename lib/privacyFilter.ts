import type { PrivacyRisk } from "@/types";

export function shouldBlockFragment(risk?: PrivacyRisk) {
  return risk?.riskLevel === "high";
}
