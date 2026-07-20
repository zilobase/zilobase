import type {
  Entitlements,
  EntitlementContext,
  EntitlementResolver,
  Feature,
  Tier,
} from "@zilobase/core-ports";

import type { LicensePayload } from "./payload";
import { featuresForTier, TIER_RANK } from "./tiers";
import { verifyLicense, type VerifyOptions } from "./verify";

/** Entitlements for an unlicensed (Community) instance. */
export const COMMUNITY_ENTITLEMENTS: Entitlements = {
  tier: "community",
  seats: null,
  features: [],
  expiresAt: null,
  isTrial: false,
  has: () => false,
  atLeast: (tier) => TIER_RANK.community >= TIER_RANK[tier],
  withinSeatLimit: () => true,
};

export function entitlementsFromPayload(payload: LicensePayload): Entitlements {
  const granted = new Set<Feature>([
    ...featuresForTier(payload.tier),
    ...(payload.features ?? []),
  ]);
  return {
    tier: payload.tier,
    seats: payload.seats,
    features: [...granted],
    expiresAt: payload.expiresAt,
    isTrial: payload.isTrial ?? false,
    has: (feature) => granted.has(feature),
    atLeast: (tier: Tier) => TIER_RANK[payload.tier] >= TIER_RANK[tier],
    withinSeatLimit: (activeUsers) =>
      payload.seats === null ? true : activeUsers <= payload.seats,
  };
}

/**
 * Resolve entitlements from a license token. On a missing, malformed, or
 * expired token this fails safe to Community rather than throwing, so the app
 * always boots. Call `verifyLicense()` directly when you need the specific
 * error (e.g. to warn an admin that their license expired).
 */
export function loadEntitlements(
  token: string | null | undefined,
  options?: VerifyOptions,
): Entitlements {
  if (!token) return COMMUNITY_ENTITLEMENTS;
  try {
    return entitlementsFromPayload(verifyLicense(token, options));
  } catch {
    return COMMUNITY_ENTITLEMENTS;
  }
}

/**
 * Self-host / air-gap resolver: one offline license token covers the whole
 * instance, so `workspaceId` is ignored. Cloud provides a different resolver
 * (subscription lookup keyed by workspace) implementing the same interface.
 */
export function createLicenseResolver(
  getToken: () => string | null | undefined,
  options?: VerifyOptions,
): EntitlementResolver {
  return {
    resolve(_ctx?: EntitlementContext): Promise<Entitlements> {
      return Promise.resolve(loadEntitlements(getToken(), options));
    },
  };
}
