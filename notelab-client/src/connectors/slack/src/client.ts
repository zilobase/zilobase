import { SLACK_API_BASE_URL } from "./constants.js";
import { SlackConnectorError } from "./errors.js";
import { resolveFetch, type SlackFetch } from "./fetch.js";
import type {
  SlackApiResponse,
  SlackAuthTestResponse,
  SlackCanvasSectionLookupCriteria,
  SlackCanvasSectionsLookupResponse,
  SlackConversationHistoryResponse,
  SlackConversationRepliesResponse,
  SlackFileInfoResponse,
  SlackListFilesResponse,
  SlackListConversationsResponse,
} from "./types.js";

export type SlackClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetch?: SlackFetch;
};

export type ListSlackConversationsOptions = {
  cursor?: string;
  excludeArchived?: boolean;
  limit?: number;
  teamId?: string;
  types?: string[];
};

export type GetSlackConversationHistoryOptions = {
  channel: string;
  cursor?: string;
  inclusive?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
};

export type GetSlackConversationRepliesOptions = {
  channel: string;
  cursor?: string;
  inclusive?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
  ts: string;
};

export type ListSlackFilesOptions = {
  channel?: string;
  count?: number;
  page?: number;
  showFilesHiddenByLimit?: boolean;
  teamId?: string;
  tsFrom?: string;
  tsTo?: string;
  types?: string;
  user?: string;
};

export type GetSlackFileInfoOptions = {
  cursor?: string;
  file: string;
  limit?: number;
};

export type LookupSlackCanvasSectionsOptions = {
  canvasId: string;
  criteria: SlackCanvasSectionLookupCriteria;
};

export class SlackReadonlyClient {
  readonly #accessToken: string;
  readonly #baseUrl: string;
  readonly #fetch: SlackFetch;

  constructor({
    accessToken,
    baseUrl = SLACK_API_BASE_URL,
    fetch: fetchImpl,
  }: SlackClientOptions) {
    this.#accessToken = accessToken;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = resolveFetch(fetchImpl);
  }

  authTest() {
    return this.#request<SlackAuthTestResponse>("auth.test");
  }

  listConversations(options: ListSlackConversationsOptions = {}) {
    const search = new URLSearchParams();

    if (options.cursor) {
      search.set("cursor", options.cursor);
    }

    if (options.excludeArchived !== undefined) {
      search.set("exclude_archived", String(options.excludeArchived));
    }

    if (options.limit) {
      search.set("limit", String(options.limit));
    }

    if (options.teamId) {
      search.set("team_id", options.teamId);
    }

    if (options.types?.length) {
      search.set("types", options.types.join(","));
    }

    return this.#request<SlackListConversationsResponse>(
      `conversations.list${toQueryString(search)}`,
    );
  }

  getConversationHistory(options: GetSlackConversationHistoryOptions) {
    const search = getConversationSearchParams(options);

    return this.#request<SlackConversationHistoryResponse>(
      `conversations.history${toQueryString(search)}`,
    );
  }

  getConversationReplies(options: GetSlackConversationRepliesOptions) {
    const search = getConversationSearchParams(options);
    search.set("ts", options.ts);

    return this.#request<SlackConversationRepliesResponse>(
      `conversations.replies${toQueryString(search)}`,
    );
  }

  listFiles(options: ListSlackFilesOptions = {}) {
    const search = new URLSearchParams();

    if (options.channel) {
      search.set("channel", options.channel);
    }

    if (options.count) {
      search.set("count", String(options.count));
    }

    if (options.page) {
      search.set("page", String(options.page));
    }

    if (options.showFilesHiddenByLimit !== undefined) {
      search.set(
        "show_files_hidden_by_limit",
        String(options.showFilesHiddenByLimit),
      );
    }

    if (options.teamId) {
      search.set("team_id", options.teamId);
    }

    if (options.tsFrom) {
      search.set("ts_from", options.tsFrom);
    }

    if (options.tsTo) {
      search.set("ts_to", options.tsTo);
    }

    if (options.types) {
      search.set("types", options.types);
    }

    if (options.user) {
      search.set("user", options.user);
    }

    return this.#request<SlackListFilesResponse>(
      `files.list${toQueryString(search)}`,
    );
  }

  getFileInfo(options: GetSlackFileInfoOptions) {
    const search = new URLSearchParams({ file: options.file });

    if (options.cursor) {
      search.set("cursor", options.cursor);
    }

    if (options.limit) {
      search.set("limit", String(options.limit));
    }

    return this.#request<SlackFileInfoResponse>(
      `files.info${toQueryString(search)}`,
    );
  }

  lookupCanvasSections(options: LookupSlackCanvasSectionsOptions) {
    return this.#post<SlackCanvasSectionsLookupResponse>(
      "canvases.sections.lookup",
      {
        canvas_id: options.canvasId,
        criteria: options.criteria,
      },
    );
  }

  async #request<T extends SlackApiResponse>(path: string): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/${path}`, {
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new SlackConnectorError(
        formatSlackApiError("SLACK_API_REQUEST_FAILED"),
        {
          code: "SLACK_API_REQUEST_FAILED",
          status: response.status,
        },
      );
    }

    const body = (await response.json()) as T;

    if (!body.ok) {
      const code = body.error ?? "SLACK_API_REQUEST_FAILED";

      throw new SlackConnectorError(formatSlackApiError(code), {
        code,
        status: response.status,
      });
    }

    return body;
  }

  async #post<T extends SlackApiResponse>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new SlackConnectorError(
        formatSlackApiError("SLACK_API_REQUEST_FAILED"),
        {
          code: "SLACK_API_REQUEST_FAILED",
          status: response.status,
        },
      );
    }

    const responseBody = (await response.json()) as T;

    if (!responseBody.ok) {
      const code = responseBody.error ?? "SLACK_API_REQUEST_FAILED";

      throw new SlackConnectorError(formatSlackApiError(code), {
        code,
        status: response.status,
      });
    }

    return responseBody;
  }
}

function toQueryString(search: URLSearchParams) {
  const value = search.toString();
  return value ? `?${value}` : "";
}

function formatSlackApiError(code: string) {
  if (code === "not_in_channel") {
    return "Slack API request failed: not_in_channel. Invite the Notelab Slack app to that channel with /invite @notelab, then retry.";
  }

  if (code === "channel_not_found") {
    return "Slack API request failed: channel_not_found. The channel id was not found or the Notelab Slack app cannot see it.";
  }

  if (code === "missing_scope") {
    return "Slack API request failed: missing_scope. Reconnect Slack so the app can request the required read permission.";
  }

  if (code === "invalid_auth" || code === "token_revoked") {
    return `Slack API request failed: ${code}. Reconnect Slack in organization settings.`;
  }

  return `Slack API request failed: ${code}.`;
}

function getConversationSearchParams(
  options: GetSlackConversationHistoryOptions | GetSlackConversationRepliesOptions,
) {
  const search = new URLSearchParams({ channel: options.channel });

  if (options.cursor) {
    search.set("cursor", options.cursor);
  }

  if (options.inclusive !== undefined) {
    search.set("inclusive", String(options.inclusive));
  }

  if (options.latest) {
    search.set("latest", options.latest);
  }

  if (options.limit) {
    search.set("limit", String(options.limit));
  }

  if (options.oldest) {
    search.set("oldest", options.oldest);
  }

  return search;
}
