export const GMAIL_API_BASE_URL = "https://gmail.googleapis.com";

export const PEOPLE_API_BASE_URL = "https://people.googleapis.com";

export const GOOGLE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

export const GOOGLE_PEOPLE_CONTACTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";

export const GOOGLE_APPS_LICENSING_SCOPE =
  "https://www.googleapis.com/auth/apps.licensing";

export const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GMAIL_CONNECTOR_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GMAIL_READONLY_SCOPE,
  GOOGLE_PEOPLE_CONTACTS_READONLY_SCOPE,
] as const;

export const GOOGLE_WORKSPACE_PRODUCT_ID = "Google-Apps";

export const GOOGLE_WORKSPACE_PAID_SKU_IDS = [
  "1010020027",
  "1010020028",
  "1010020025",
  "1010020029",
  "1010020026",
  "1010020020",
  "1010020030",
  "1010020031",
  "1010020034",
  "1010020035",
  "1010020036",
  "Google-Apps-Unlimited",
  "Google-Apps-For-Business",
  "Google-Apps-For-Nonprofits",
] as const;
