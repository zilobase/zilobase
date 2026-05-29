import { GOOGLE_CALENDAR_API_BASE_URL } from "./constants.js";
import { GoogleCalendarConnectorError } from "./errors.js";
import { resolveFetch, type GoogleCalendarFetch } from "./fetch.js";
import type {
  GoogleCalendarEventsResponse,
  GoogleCalendarFreeBusyRequestItem,
  GoogleCalendarFreeBusyResponse,
  GoogleCalendarListResponse,
} from "./types.js";

export type GoogleCalendarClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetch?: GoogleCalendarFetch;
};

export type ListGoogleCalendarEventsOptions = {
  calendarId?: string;
  maxResults?: number;
  orderBy?: "startTime" | "updated";
  pageToken?: string;
  q?: string;
  showDeleted?: boolean;
  singleEvents?: boolean;
  timeMax?: string;
  timeMin?: string;
  timeZone?: string;
};

export type QueryGoogleCalendarFreeBusyOptions = {
  calendarExpansionMax?: number;
  groupExpansionMax?: number;
  items: GoogleCalendarFreeBusyRequestItem[];
  timeMax: string;
  timeMin: string;
  timeZone?: string;
};

export class GoogleCalendarReadonlyClient {
  readonly #accessToken: string;
  readonly #baseUrl: string;
  readonly #fetch: GoogleCalendarFetch;

  constructor({
    accessToken,
    baseUrl = GOOGLE_CALENDAR_API_BASE_URL,
    fetch: fetchImpl,
  }: GoogleCalendarClientOptions) {
    this.#accessToken = accessToken;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = resolveFetch(fetchImpl);
  }

  listCalendars(options: { maxResults?: number; pageToken?: string } = {}) {
    const search = new URLSearchParams();

    if (options.maxResults) {
      search.set("maxResults", String(options.maxResults));
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    return this.#request<GoogleCalendarListResponse>(
      `users/me/calendarList${toQueryString(search)}`,
    );
  }

  listEvents({
    calendarId = "primary",
    ...options
  }: ListGoogleCalendarEventsOptions = {}) {
    const search = new URLSearchParams();

    if (options.maxResults) {
      search.set("maxResults", String(options.maxResults));
    }

    if (options.orderBy) {
      search.set("orderBy", options.orderBy);
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    if (options.q) {
      search.set("q", options.q);
    }

    if (options.showDeleted !== undefined) {
      search.set("showDeleted", String(options.showDeleted));
    }

    if (options.singleEvents !== undefined) {
      search.set("singleEvents", String(options.singleEvents));
    }

    if (options.timeMax) {
      search.set("timeMax", options.timeMax);
    }

    if (options.timeMin) {
      search.set("timeMin", options.timeMin);
    }

    if (options.timeZone) {
      search.set("timeZone", options.timeZone);
    }

    return this.#request<GoogleCalendarEventsResponse>(
      `calendars/${encodeURIComponent(calendarId)}/events${toQueryString(
        search,
      )}`,
    );
  }

  async queryFreeBusy(options: QueryGoogleCalendarFreeBusyOptions) {
    const response = await this.#fetch(`${this.#baseUrl}/freeBusy`, {
      method: "POST",
      body: JSON.stringify(options),
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new GoogleCalendarConnectorError(
        "Google Calendar API request failed.",
        {
          code: "GOOGLE_CALENDAR_API_REQUEST_FAILED",
          status: response.status,
        },
      );
    }

    return response.json() as Promise<GoogleCalendarFreeBusyResponse>;
  }

  async #request<T>(path: string): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/${path}`, {
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new GoogleCalendarConnectorError(
        "Google Calendar API request failed.",
        {
          code: "GOOGLE_CALENDAR_API_REQUEST_FAILED",
          status: response.status,
        },
      );
    }

    return response.json() as Promise<T>;
  }
}

function toQueryString(search: URLSearchParams) {
  const value = search.toString();
  return value ? `?${value}` : "";
}
