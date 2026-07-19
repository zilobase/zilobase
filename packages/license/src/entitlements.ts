import type { Entitlements, Feature } from "@zilobase/core-ports";

import type { LicensePayload } from "./payload.ts";
import { featuresForTier } from "./tiers.ts";
import { verifyLicense, type VerifyOptions } from "./verify.ts";

/** Entitlements for an unlicensed (Community) instance. */
export const COMMUNITY_ENTITLEMENTS: Entitlements = {
  tier: "community",
  seats: null,
  features: [],
  expiresAt: null,
  has: () => false,
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
    has: (feature) => granted.has(feature),
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
