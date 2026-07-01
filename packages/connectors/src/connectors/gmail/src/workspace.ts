import type {
  GmailPageEligibilityInput,
  GmailPageEligibilityResult,
  GoogleIdTokenClaims,
} from "./types.js";

export function getHostedDomainFromClaims(claims: GoogleIdTokenClaims) {
  return normalizeDomain(claims.hd);
}

export function getEmailDomain(email: string) {
  const [, domain] = normalizeEmail(email).split("@");
  return normalizeDomain(domain);
}

export function isConsumerGmailAddress(email: string) {
  const domain = getEmailDomain(email);
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function evaluateGmailPageEligibility({
  allowedEmails,
  connectedEmail,
  hostedDomain,
  licenseVerified = false,
  requirePaidPageLicense = true,
}: GmailPageEligibilityInput): GmailPageEligibilityResult {
  const normalizedConnectedEmail = normalizeEmail(connectedEmail);
  const normalizedHostedDomain = normalizeDomain(hostedDomain);
  const allowedEmailSet = new Set(allowedEmails.map(normalizeEmail));

  if (!allowedEmailSet.has(normalizedConnectedEmail)) {
    return {
      ok: false,
      connectedEmail: normalizedConnectedEmail,
      hostedDomain: normalizedHostedDomain,
      reason: "email_not_allowed",
    };
  }

  if (!normalizedHostedDomain) {
    return {
      ok: false,
      connectedEmail: normalizedConnectedEmail,
      reason: isConsumerGmailAddress(normalizedConnectedEmail)
        ? "consumer_google_account"
        : "missing_hosted_domain",
    };
  }

  if (requirePaidPageLicense && !licenseVerified) {
    return {
      ok: false,
      connectedEmail: normalizedConnectedEmail,
      hostedDomain: normalizedHostedDomain,
      reason: "paid_page_license_required",
    };
  }

  return {
    ok: true,
    connectedEmail: normalizedConnectedEmail,
    hostedDomain: normalizedHostedDomain,
    reason: "eligible",
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeDomain(domain?: string | null) {
  return domain?.trim().toLowerCase().replace(/^@/, "") || undefined;
}
