import { GMAIL_API_BASE_URL, PEOPLE_API_BASE_URL } from "./constants.js";
import { GmailConnectorError } from "./errors.js";
import { resolveFetch, type GmailFetch } from "./fetch.js";
import type {
  GmailDraft,
  GooglePeopleConnectionsResponse,
  GmailLabel,
  GmailListDraftsResponse,
  GmailListHistoryResponse,
  GmailListLabelsResponse,
  GmailListMessagesResponse,
  GmailListThreadsResponse,
  GmailMessageAttachment,
  GmailMessage,
  GmailProfile,
  GmailThread,
} from "./types.js";

export type GmailClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetch?: GmailFetch;
  peopleBaseUrl?: string;
  userId?: "me" | string;
};

export type ListGmailMessagesOptions = {
  includeSpamTrash?: boolean;
  labelIds?: string[];
  maxResults?: number;
  pageToken?: string;
  query?: string;
};

export type ListGmailThreadsOptions = ListGmailMessagesOptions;

export type GetGmailMessageOptions = {
  format?: "full" | "metadata" | "minimal" | "raw";
  metadataHeaders?: string[];
};

export type GetGmailThreadOptions = {
  format?: "full" | "metadata" | "minimal";
  metadataHeaders?: string[];
};

export type ListGmailHistoryOptions = {
  historyTypes?: Array<
    "labelAdded" | "labelRemoved" | "messageAdded" | "messageDeleted"
  >;
  labelId?: string;
  maxResults?: number;
  pageToken?: string;
  startHistoryId: string;
};

export type ListGooglePeopleConnectionsOptions = {
  pageSize?: number;
  pageToken?: string;
};

export class GmailReadonlyClient {
  readonly #accessToken: string;
  readonly #baseUrl: string;
  readonly #fetch: GmailFetch;
  readonly #peopleBaseUrl: string;
  readonly #userId: string;

  constructor({
    accessToken,
    baseUrl = GMAIL_API_BASE_URL,
    fetch: fetchImpl,
    peopleBaseUrl = PEOPLE_API_BASE_URL,
    userId = "me",
  }: GmailClientOptions) {
    this.#accessToken = accessToken;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = resolveFetch(fetchImpl);
    this.#peopleBaseUrl = peopleBaseUrl.replace(/\/$/, "");
    this.#userId = encodeURIComponent(userId);
  }

  getProfile() {
    return this.#request<GmailProfile>("profile");
  }

  listLabels() {
    return this.#request<GmailListLabelsResponse>("labels");
  }

  getLabel(id: string) {
    return this.#request<GmailLabel>(`labels/${encodeURIComponent(id)}`);
  }

  listDrafts(options: Pick<ListGmailMessagesOptions, "maxResults" | "pageToken"> = {}) {
    const search = new URLSearchParams();

    if (options.maxResults) {
      search.set("maxResults", String(options.maxResults));
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    return this.#request<GmailListDraftsResponse>(
      `drafts${toQueryString(search)}`,
    );
  }

  getDraft(id: string, options: GetGmailMessageOptions = {}) {
    return this.#request<GmailDraft>(
      `drafts/${encodeURIComponent(id)}${toQueryString(
        getFormatSearchParams(options),
      )}`,
    );
  }

  listMessages(options: ListGmailMessagesOptions = {}) {
    const search = new URLSearchParams();

    if (options.maxResults) {
      search.set("maxResults", String(options.maxResults));
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    if (options.query) {
      search.set("q", options.query);
    }

    if (options.includeSpamTrash !== undefined) {
      search.set("includeSpamTrash", String(options.includeSpamTrash));
    }

    for (const labelId of options.labelIds ?? []) {
      search.append("labelIds", labelId);
    }

    return this.#request<GmailListMessagesResponse>(
      `messages${toQueryString(search)}`,
    );
  }

  getMessage(id: string, options: GetGmailMessageOptions = {}) {
    return this.#request<GmailMessage>(
      `messages/${encodeURIComponent(id)}${toQueryString(
        getFormatSearchParams(options),
      )}`,
    );
  }

  listThreads(options: ListGmailThreadsOptions = {}) {
    const search = getListSearchParams(options);

    return this.#request<GmailListThreadsResponse>(
      `threads${toQueryString(search)}`,
    );
  }

  getMessageAttachment(messageId: string, attachmentId: string) {
    return this.#request<GmailMessageAttachment>(
      `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(
        attachmentId,
      )}`,
    );
  }

  getThread(id: string, options: GetGmailThreadOptions = {}) {
    return this.#request<GmailThread>(
      `threads/${encodeURIComponent(id)}${toQueryString(
        getFormatSearchParams(options),
      )}`,
    );
  }

  listHistory(options: ListGmailHistoryOptions) {
    const search = new URLSearchParams();
    search.set("startHistoryId", options.startHistoryId);

    if (options.maxResults) {
      search.set("maxResults", String(options.maxResults));
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    if (options.labelId) {
      search.set("labelId", options.labelId);
    }

    for (const historyType of options.historyTypes ?? []) {
      search.append("historyTypes", historyType);
    }

    return this.#request<GmailListHistoryResponse>(
      `history${toQueryString(search)}`,
    );
  }

  listContactProfiles(options: ListGooglePeopleConnectionsOptions = {}) {
    const search = new URLSearchParams();
    search.set("personFields", "emailAddresses,names,photos");

    if (options.pageSize) {
      search.set("pageSize", String(options.pageSize));
    }

    if (options.pageToken) {
      search.set("pageToken", options.pageToken);
    }

    return this.#requestPeople<GooglePeopleConnectionsResponse>(
      `people/me/connections${toQueryString(search)}`,
    );
  }

  async #request<T>(path: string): Promise<T> {
    const response = await this.#fetch(
      `${this.#baseUrl}/gmail/v1/users/${this.#userId}/${path}`,
      {
        headers: {
          authorization: `Bearer ${this.#accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new GmailConnectorError("Gmail API request failed.", {
        code: "GMAIL_API_REQUEST_FAILED",
        status: response.status,
      });
    }

    return response.json() as Promise<T>;
  }

  async #requestPeople<T>(path: string): Promise<T> {
    const response = await this.#fetch(`${this.#peopleBaseUrl}/v1/${path}`, {
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new GmailConnectorError("Google People API request failed.", {
        code: "GOOGLE_PEOPLE_API_REQUEST_FAILED",
        status: response.status,
      });
    }

    return response.json() as Promise<T>;
  }
}

function getListSearchParams(
  options: ListGmailMessagesOptions | ListGmailThreadsOptions,
) {
  const search = new URLSearchParams();

  if (options.maxResults) {
    search.set("maxResults", String(options.maxResults));
  }

  if (options.pageToken) {
    search.set("pageToken", options.pageToken);
  }

  if (options.query) {
    search.set("q", options.query);
  }

  if (options.includeSpamTrash !== undefined) {
    search.set("includeSpamTrash", String(options.includeSpamTrash));
  }

  for (const labelId of options.labelIds ?? []) {
    search.append("labelIds", labelId);
  }

  return search;
}

function getFormatSearchParams(
  options: GetGmailMessageOptions | GetGmailThreadOptions,
) {
  const search = new URLSearchParams();

  if (options.format) {
    search.set("format", options.format);
  }

  for (const header of options.metadataHeaders ?? []) {
    search.append("metadataHeaders", header);
  }

  return search;
}

function toQueryString(search: URLSearchParams) {
  const value = search.toString();
  return value ? `?${value}` : "";
}
