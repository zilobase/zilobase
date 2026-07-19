/**
 * The edition tier a running instance is entitled to.
 *
 * `community` is the default when no valid license is present. `professional`
 * and `enterprise` are unlocked by a signed license (see `@zilobase/license`).
 */
export type Tier = "community" | "professional" | "enterprise";

/**
 * A gateable capability. Feature code checks `entitlements.has(feature)` and
 * never inspects the tier directly — which tier grants which feature is a
 * business decision owned solely by `@zilobase/license` (tiers.ts).
 */
export type Feature =
  | "sso.saml"
  | "sso.oidc.enterprise"
  | "scim"
  | "rbac.custom"
  | "audit.log"
  | "audit.export"
  | "audit.legal_hold"
  | "data.retention"
  | "branding.custom"
  | "branding.white_label"
  | "security.byok"
  | "ops.ha"
  | "support.sla";
