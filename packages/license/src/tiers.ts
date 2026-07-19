import type { Feature, Tier } from "@zilobase/core-ports";

/**
 * The tier -> feature policy: the single place that decides which capabilities
 * each tier unlocks.
 *
 * This is the most volatile business decision in the system (pricing/packaging
 * changes often), so it lives behind this one module. Re-tiering a feature is a
 * one-line edit here and never touches the feature's implementation.
 */
export const TIER_FEATURES: Record<Tier, readonly Feature[]> = {
  community: [],
  professional: [
    "sso.saml",
    "sso.oidc.enterprise",
    "rbac.custom",
    "branding.custom",
    "support.sla",
  ],
  enterprise: [
    "sso.saml",
    "sso.oidc.enterprise",
    "scim",
    "rbac.custom",
    "audit.log",
    "audit.export",
    "audit.legal_hold",
    "data.retention",
    "branding.custom",
    "branding.white_label",
    "security.byok",
    "ops.ha",
    "support.sla",
  ],
};

export function featuresForTier(tier: Tier): readonly Feature[] {
  return TIER_FEATURES[tier] ?? [];
}
