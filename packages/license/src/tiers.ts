import type { Feature, Tier } from "@zilobase/core-ports";

/**
 * The tier -> feature policy: the single place that decides which capabilities
 * each tier unlocks (Parnas: the most volatile business decision, hidden behind
 * one module). Re-tiering a feature is a one-line edit here.
 */
// Notion-mapped: Teams (Professional) = Notion Business (SSO lands here);
// Enterprise = Notion Enterprise (SCIM, audit, security). Enterprise is a
// strict superset of Professional.
const PROFESSIONAL_FEATURES: readonly Feature[] = [
  "sso.saml",
  "sso.oidc.enterprise",
  "domain.capture",
  "guest.accounts",
  "teamspace.private",
  "rbac.custom",
  "history.extended",
  "admin.console",
  "branding.custom",
  "support.sla",
];

const ENTERPRISE_ONLY_FEATURES: readonly Feature[] = [
  "scim",
  "sso.enforced",
  "mfa.enforced",
  "org.multi_workspace",
  "audit.log",
  "audit.export",
  "audit.legal_hold",
  "data.retention",
  "data.residency",
  "ai.zero_retention",
  "analytics",
  "security.byok",
  "security.ip_allowlist",
  "branding.white_label",
  "ops.ha",
];

export const TIER_FEATURES: Record<Tier, readonly Feature[]> = {
  community: [],
  professional: PROFESSIONAL_FEATURES,
  enterprise: [...PROFESSIONAL_FEATURES, ...ENTERPRISE_ONLY_FEATURES],
};

/** Total order over tiers, for `atLeast()` (tier-level gating). */
export const TIER_RANK: Record<Tier, number> = {
  community: 0,
  professional: 1,
  enterprise: 2,
};

export function featuresForTier(tier: Tier): readonly Feature[] {
  return TIER_FEATURES[tier] ?? [];
}
