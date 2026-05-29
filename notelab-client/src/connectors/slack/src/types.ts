import type { SLACK_CONNECTOR_SCOPES } from "./constants.js";

export type SlackConnectorScope =
  | (typeof SLACK_CONNECTOR_SCOPES)[number]
  | string;

export type SlackApiResponse = {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    next_cursor?: string;
    warnings?: string[];
  };
};

export type SlackOAuthTokenResponse = SlackApiResponse & {
  access_token?: string;
  app_id?: string;
  authed_user?: {
    access_token?: string;
    expires_in?: number;
    id: string;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };
  bot_user_id?: string;
  enterprise?: SlackEnterprise | null;
  expires_in?: number;
  is_enterprise_install?: boolean;
  refresh_token?: string;
  scope?: string;
  team?: SlackTeam | null;
  token_type?: string;
};

export type SlackTeam = {
  id: string;
  name?: string;
};

export type SlackEnterprise = {
  id: string;
  name?: string;
};

export type SlackAuthTestResponse = SlackApiResponse & {
  app_id?: string;
  bot_id?: string;
  enterprise_id?: string;
  team?: string;
  team_id?: string;
  url?: string;
  user?: string;
  user_id?: string;
};

export type SlackConversation = {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  num_members?: number;
  topic?: {
    value?: string;
  };
  purpose?: {
    value?: string;
  };
};

export type SlackListConversationsResponse = SlackApiResponse & {
  channels?: SlackConversation[];
};

export type SlackMessage = {
  bot_id?: string;
  channel?: string;
  client_msg_id?: string;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts: string;
  type?: string;
  user?: string;
};

export type SlackConversationHistoryResponse = SlackApiResponse & {
  has_more?: boolean;
  messages?: SlackMessage[];
  pin_count?: number;
};

export type SlackConversationRepliesResponse = SlackApiResponse & {
  has_more?: boolean;
  messages?: SlackMessage[];
};

export type SlackCanvasSectionType = "h1" | "h2" | "h3" | "any_header";

export type SlackCanvasSectionLookupCriteria = {
  contains_text?: string;
  section_types?: SlackCanvasSectionType[];
};

export type SlackCanvasSection = {
  id: string;
};

export type SlackCanvasSectionsLookupResponse = SlackApiResponse & {
  sections?: SlackCanvasSection[];
};

export type SlackFile = {
  id: string;
  created?: number;
  timestamp?: number;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  user?: string;
  size?: number;
  mode?: string;
  is_external?: boolean;
  external_type?: string;
  is_public?: boolean;
  public_url_shared?: boolean;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  channels?: string[];
  groups?: string[];
  ims?: string[];
  comments_count?: number;
  alt_txt?: string;
};

export type SlackListFilesResponse = SlackApiResponse & {
  files?: SlackFile[];
  paging?: {
    count?: number;
    page?: number;
    pages?: number;
    total?: number;
  };
};

export type SlackFileInfoResponse = SlackApiResponse & {
  comments?: Array<{
    comment?: string;
    created?: number;
    id?: string;
    timestamp?: number;
    user?: string;
  }>;
  file?: SlackFile;
};
