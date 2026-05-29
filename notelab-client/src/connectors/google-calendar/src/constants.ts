export const GOOGLE_CALENDAR_API_BASE_URL =
  "https://www.googleapis.com/calendar/v3";

export const GOOGLE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_CALENDAR_FREEBUSY_SCOPE =
  "https://www.googleapis.com/auth/calendar.freebusy";

export const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GOOGLE_CALENDAR_CONNECTOR_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GOOGLE_CALENDAR_READONLY_SCOPE,
] as const;

export const GOOGLE_CALENDAR_COWORKER_SCOPES = [
  ...GOOGLE_CALENDAR_CONNECTOR_SCOPES,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
] as const;
