export type GoogleCalendarConnectorScope =
  | "openid"
  | "email"
  | "profile"
  | "https://www.googleapis.com/auth/calendar.readonly"
  | "https://www.googleapis.com/auth/calendar.freebusy";

export type GoogleCalendarOAuthTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export type GoogleIdTokenClaims = {
  aud?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
  hd?: string;
  iat?: number;
  iss?: string;
  sub?: string;
};

export type GoogleCalendarCalendarListEntry = {
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner" | string;
  backgroundColor?: string;
  description?: string;
  foregroundColor?: string;
  id: string;
  location?: string;
  primary?: boolean;
  selected?: boolean;
  summary?: string;
  summaryOverride?: string;
  timeZone?: string;
};

export type GoogleCalendarListResponse = {
  etag?: string;
  items?: GoogleCalendarCalendarListEntry[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

export type GoogleCalendarEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEventAttendee = {
  displayName?: string;
  email?: string;
  optional?: boolean;
  organizer?: boolean;
  responseStatus?: string;
  self?: boolean;
};

export type GoogleCalendarEvent = {
  attendees?: GoogleCalendarEventAttendee[];
  created?: string;
  creator?: {
    displayName?: string;
    email?: string;
    self?: boolean;
  };
  description?: string;
  end?: GoogleCalendarEventDateTime;
  hangoutLink?: string;
  htmlLink?: string;
  iCalUID?: string;
  id: string;
  location?: string;
  organizer?: {
    displayName?: string;
    email?: string;
    self?: boolean;
  };
  recurringEventId?: string;
  start?: GoogleCalendarEventDateTime;
  status?: string;
  summary?: string;
  updated?: string;
  visibility?: string;
};

export type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  summary?: string;
  timeZone?: string;
  updated?: string;
};

export type GoogleCalendarFreeBusyRequestItem = {
  id: string;
};

export type GoogleCalendarFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: Array<{
        end: string;
        start: string;
      }>;
      errors?: Array<{
        domain?: string;
        reason?: string;
      }>;
    }
  >;
  groups?: Record<
    string,
    {
      calendars?: string[];
      errors?: Array<{
        domain?: string;
        reason?: string;
      }>;
    }
  >;
  kind?: string;
  timeMax?: string;
  timeMin?: string;
};

export type GoogleCalendarEventSummary = {
  attendees?: GoogleCalendarEventAttendee[];
  calendarId: string;
  description?: string;
  end?: GoogleCalendarEventDateTime;
  htmlLink?: string;
  id: string;
  location?: string;
  organizer?: {
    displayName?: string;
    email?: string;
    self?: boolean;
  };
  start?: GoogleCalendarEventDateTime;
  status?: string;
  summary?: string;
};
