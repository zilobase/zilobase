export { TIER_FEATURES, featuresForTier } from "./tiers.ts";
export { signLicense } from "./sign.ts";
export { verifyLicense, LicenseError, type VerifyOptions } from "./verify.ts";
export {
  COMMUNITY_ENTITLEMENTS,
  entitlementsFromPayload,
  loadEntitlements,
} from "./entitlements.ts";
export { EMBEDDED_PUBLIC_KEY } from "./keys.ts";
export type { LicensePayload } from "./payload.ts";
