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
  // --- Teams (Professional): the "put it behind SSO" tier ---------------
  | "sso.saml" // SAML 2.0 SSO
  | "sso.oidc.enterprise" // enterprise OIDC SSO
  | "domain.capture" // claim an email domain -> JIT auto-join a workspace
  | "guest.accounts" // external collaborators
  | "teamspace.private" // private teamspaces
  | "rbac.custom" // custom roles + granular page/DB permissions
  | "history.extended" // longer page history
  | "admin.console" // members/roles/SSO admin surface
  | "support.sla" // priority support
  // --- Enterprise: compliance, scale, security --------------------------
  | "scim" // auto de/provisioning + group->role/teamspace
  | "sso.enforced" // disable password login for captured domains
  | "mfa.enforced" // org-wide MFA requirement
  | "org.multi_workspace" // one org owning many workspaces + central admin
  | "audit.log"
  | "audit.export" // eDiscovery export
  | "audit.legal_hold"
  | "data.retention"
  | "data.residency"
  | "ai.zero_retention" // zero-data-retention AI
  | "analytics" // workspace analytics
  | "security.byok" // customer-held encryption keys / KMS
  | "security.ip_allowlist"
  | "branding.custom"
  | "branding.white_label"
  | "ops.ha";
