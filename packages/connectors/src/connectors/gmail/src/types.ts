export type GmailConnectorScope =
  | "openid"
  | "email"
  | "profile"
  | "https://www.googleapis.com/auth/gmail.readonly"
  | "https://www.googleapis.com/auth/contacts.readonly"
  | "https://www.googleapis.com/auth/apps.licensing";

export type GmailOAuthTokenResponse = {
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

export type GmailProfile = {
  emailAddress: string;
  historyId?: string;
  messagesTotal?: number;
  threadsTotal?: number;
};

export type GmailListMessagesResponse = {
  messages?: Array<{
    id: string;
    threadId: string;
  }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailListThreadsResponse = {
  threads?: Array<{
    id: string;
    snippet?: string;
    historyId?: string;
  }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailLabelColor = {
  backgroundColor?: string;
  textColor?: string;
};

export type GmailLabel = {
  color?: GmailLabelColor;
  id: string;
  labelListVisibility?: string;
  messageListVisibility?: string;
  messagesTotal?: number;
  messagesUnread?: number;
  name: string;
  threadsTotal?: number;
  threadsUnread?: number;
  type?: "system" | "user" | string;
};

export type GmailListLabelsResponse = {
  labels?: GmailLabel[];
};

export type GmailMessagePartHeader = {
  name: string;
  value: string;
};

export type GmailMessagePartBody = {
  attachmentId?: string;
  data?: string;
  size?: number;
};

export type GmailMessagePart = {
  body?: GmailMessagePartBody;
  filename?: string;
  headers?: GmailMessagePartHeader[];
  mimeType?: string;
  partId?: string;
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  historyId?: string;
  id: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
  raw?: string;
  sizeEstimate?: number;
  snippet?: string;
  threadId: string;
};

export type GmailDraft = {
  id: string;
  message?: GmailMessage;
};

export type GmailListDraftsResponse = {
  drafts?: GmailDraft[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailMessageAttachment = {
  attachmentId: string;
  data?: string;
  size?: number;
};

export type GmailAttachmentSummary = {
  attachmentId?: string;
  filename?: string;
  mimeType?: string;
  partId?: string;
  size?: number;
};

export type GmailThread = {
  historyId?: string;
  id: string;
  messages?: GmailMessage[];
  snippet?: string;
};

export type GmailHistoryMessageRef = {
  id: string;
  threadId: string;
};

export type GmailHistoryLabelChange = {
  labelIds?: string[];
  message?: GmailHistoryMessageRef;
};

export type GmailHistory = {
  id?: string;
  labelsAdded?: GmailHistoryLabelChange[];
  labelsRemoved?: GmailHistoryLabelChange[];
  messages?: GmailHistoryMessageRef[];
  messagesAdded?: Array<{
    message?: GmailHistoryMessageRef;
  }>;
  messagesDeleted?: Array<{
    message?: GmailHistoryMessageRef;
  }>;
};

export type GmailListHistoryResponse = {
  history?: GmailHistory[];
  historyId?: string;
  nextPageToken?: string;
};

export type GmailMessageSummary = {
  attachments?: GmailAttachmentSummary[];
  bcc?: string;
  bodyHtml?: string;
  bodyText?: string;
  cc?: string;
  date?: string;
  from?: string;
  historyId?: string;
  id: string;
  internalDate?: string;
  labelIds?: string[];
  sizeEstimate?: number;
  snippet?: string;
  subject?: string;
  senderPhotoUrl?: string;
  threadId: string;
  to?: string;
};

export type GooglePeopleEmailAddress = {
  value?: string;
};

export type GooglePeoplePhoto = {
  url?: string;
  metadata?: {
    primary?: boolean;
  };
};

export type GooglePeoplePerson = {
  emailAddresses?: GooglePeopleEmailAddress[];
  names?: Array<{
    displayName?: string;
  }>;
  photos?: GooglePeoplePhoto[];
  resourceName?: string;
};

export type GooglePeopleConnectionsResponse = {
  connections?: GooglePeoplePerson[];
  nextPageToken?: string;
  nextSyncToken?: string;
  totalItems?: number;
  totalPeople?: number;
};

export type GmailPageEligibilityInput = {
  allowedEmails: string[];
  connectedEmail: string;
  hostedDomain?: string | null;
  licenseVerified?: boolean;
  requirePaidPageLicense?: boolean;
};

export type GmailPageEligibilityResult =
  | {
      ok: true;
      connectedEmail: string;
      hostedDomain: string;
      reason: "eligible";
    }
  | {
      ok: false;
      connectedEmail: string;
      hostedDomain?: string;
      reason:
        | "consumer_google_account"
        | "email_not_allowed"
        | "missing_hosted_domain"
        | "paid_page_license_required";
    };

export type GooglePageLicenseAssignment = {
  etags?: string;
  kind?: string;
  productId: string;
  productName?: string;
  selfLink?: string;
  skuId: string;
  skuName?: string;
  userId: string;
};

export type GooglePageLicenseVerificationResult =
  | {
      ok: true;
      assignment: GooglePageLicenseAssignment;
      status: "verified";
    }
  | {
      ok: false;
      endpoint?: string;
      httpStatus?: number;
      message?: string;
      status:
        | "admin_required"
        | "api_unavailable"
        | "bad_request"
        | "license_not_found"
        | "not_configured";
    };
