"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import type {
  GmailAttachmentSummary,
  GmailHistory,
  GmailLabel,
  GmailMessageSummary,
  GmailProfile,
} from "./types.js";

const emailSeparatorBorder =
  "1px solid color-mix(in srgb, currentColor 10%, transparent)";
const gmailIconSrc = "/icons/gmail.svg";

export type GmailToolName =
  | "getGmailDraft"
  | "getGmailLabel"
  | "getGmailMessage"
  | "getGmailMessageAttachment"
  | "getGmailProfile"
  | "getGmailRawMessage"
  | "getGmailThread"
  | "listGmailHistory"
  | "listGmailDrafts"
  | "listGmailLabels"
  | "listGmailMessageAttachments"
  | "listGmailThreads"
  | "searchGmailMessages";

export type SearchGmailMessagesOutput = {
  messages?: GmailMessageSummary[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailDraftSummary = {
  id: string;
  message?: GmailMessageSummary;
};

export type ListGmailDraftsOutput = {
  drafts?: GmailDraftSummary[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GetGmailDraftOutput = GmailDraftSummary;

export type GetGmailThreadOutput = {
  historyId?: string;
  id: string;
  messages?: GmailMessageSummary[];
  snippet?: string;
};

export type ListGmailThreadsOutput = {
  nextPageToken?: string;
  resultSizeEstimate?: number;
  threads?: GetGmailThreadOutput[];
};

export type ListGmailLabelsOutput = {
  labels?: GmailLabel[];
};

export type ListGmailMessageAttachmentsOutput = {
  attachments?: GmailAttachmentSummary[];
  messageId: string;
  subject?: string;
  threadId?: string;
};

export type GetGmailMessageAttachmentOutput = {
  attachmentId: string;
  dataBase64?: string;
  decodedText?: string;
  isDataTruncated?: boolean;
  messageId: string;
  mimeType?: string;
  size?: number;
};

export type ListGmailHistoryOutput = {
  history?: GmailHistory[];
  historyId?: string;
  nextPageToken?: string;
};

export type GetGmailRawMessageOutput = {
  historyId?: string;
  id: string;
  isRawTruncated?: boolean;
  rawBase64?: string;
  sizeEstimate?: number;
  threadId: string;
};

export type GmailToolOutput =
  | GetGmailDraftOutput
  | GetGmailMessageAttachmentOutput
  | GetGmailRawMessageOutput
  | GetGmailThreadOutput
  | GmailLabel
  | GmailMessageSummary
  | GmailProfile
  | ListGmailDraftsOutput
  | ListGmailHistoryOutput
  | ListGmailLabelsOutput
  | ListGmailMessageAttachmentsOutput
  | ListGmailThreadsOutput
  | SearchGmailMessagesOutput;

export type GmailToolOutputProps = {
  className?: string;
  output: unknown;
  toolName: GmailToolName;
};

const styles: Record<string, CSSProperties> = {
  card: {
    border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
    borderRadius: 8,
    display: "grid",
    gap: 12,
    padding: 12,
  },
  inbox: {
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    boxSizing: "border-box",
    maxHeight: 400,
    maxWidth: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    width: "100%",
  },
  inboxBody: {
    boxSizing: "border-box",
    display: "grid",
    gap: 0,
    padding: "4px 0",
    width: "100%",
  },
  emailButton: {
    alignItems: "flex-start",
    background: "transparent",
    border: 0,
    borderTop: emailSeparatorBorder,
    borderRadius: 8,
    boxSizing: "border-box",
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    gap: 10,
    maxWidth: "100%",
    minWidth: 0,
    padding: "10px 12px",
    textAlign: "left",
    transition: "background 120ms ease",
    width: "100%",
  },
  avatar: {
    alignItems: "center",
    background: "color-mix(in srgb, currentColor 8%, transparent)",
    borderRadius: 999,
    display: "flex",
    flex: "0 0 auto",
    fontSize: 11,
    fontWeight: 700,
    height: 32,
    justifyContent: "center",
    marginTop: 1,
    overflow: "hidden",
    width: 32,
  },
  avatarImage: {
    display: "block",
    height: "100%",
    objectFit: "cover",
    width: "100%",
  },
  emailMain: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
  },
  emailTopline: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 2,
    maxWidth: "100%",
    minWidth: 0,
  },
  senderLine: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    flex: "1 1 auto",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
  sender: {
    flex: "0 1 auto",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.25,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  address: {
    color: "color-mix(in srgb, currentColor 56%, transparent)",
    flex: "1 1 auto",
    fontSize: 11,
    lineHeight: 1.25,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  date: {
    color: "color-mix(in srgb, currentColor 56%, transparent)",
    flex: "0 0 auto",
    fontSize: 11,
    lineHeight: 1.25,
  },
  subject: {
    color: "color-mix(in srgb, currentColor 88%, transparent)",
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.35,
    margin: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  preview: {
    color: "color-mix(in srgb, currentColor 62%, transparent)",
    fontSize: 12,
    lineHeight: 1.35,
    margin: "2px 0 0",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    alignItems: "center",
    color: "color-mix(in srgb, currentColor 62%, transparent)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    justifyContent: "center",
    minHeight: 180,
    padding: 24,
    textAlign: "center",
  },
  overlay: {
    alignItems: "center",
    background: "rgba(0, 0, 0, 0.52)",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 16,
    position: "fixed",
    zIndex: 50,
  },
  dialog: {
    background: "var(--color-background, Canvas)",
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    boxShadow: "none",
    color: "inherit",
    display: "grid",
    gap: 16,
    maxHeight: "78vh",
    maxWidth: "48rem",
    overflow: "hidden",
    padding: 20,
    width: "min(48rem, calc(100vw - 2rem))",
  },
  dialogHeader: {
    borderBottom: "1px solid #e5e7eb",
    display: "grid",
    gap: 12,
    paddingBottom: 14,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.25,
    margin: 0,
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 1.6,
    maxHeight: 400,
    overflowY: "auto",
    paddingRight: 12,
    whiteSpace: "pre-wrap",
  },
  emailFrame: {
    background: "#fff",
    border: 0,
    borderRadius: 8,
    height: "min(460px, 50vh)",
    maxWidth: "100%",
    overflow: "auto",
    width: "100%",
  },
  closeButton: {
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
    borderRadius: 6,
    color: "inherit",
    cursor: "pointer",
    fontSize: 12,
    padding: "6px 9px",
  },
  panel: {
    display: "grid",
    gap: 10,
  },
  searchHeader: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sourceTitle: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    minWidth: 0,
  },
  sourceIcon: {
    flex: "0 0 auto",
    height: 16,
    width: 16,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: 6,
  },
  toggleButton: {
    alignItems: "center",
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 70%, transparent)",
    cursor: "pointer",
    display: "inline-flex",
    font: "inherit",
    fontSize: 12,
    height: 24,
    justifyContent: "center",
    lineHeight: 1,
    padding: 0,
    width: 24,
  },
  collapseRegion: {
    display: "grid",
    overflow: "hidden",
    transition:
      "grid-template-rows 180ms ease, opacity 160ms ease, margin-top 180ms ease",
  },
  collapseInner: {
    minHeight: 0,
    overflow: "hidden",
  },
  searchSummary: {
    color: "color-mix(in srgb, currentColor 60%, transparent)",
    fontSize: 11,
    lineHeight: 1.35,
    marginTop: 2,
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
  },
  kicker: {
    color: "color-mix(in srgb, currentColor 58%, transparent)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
    marginTop: 3,
  },
  meta: {
    color: "color-mix(in srgb, currentColor 66%, transparent)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 12,
    gap: "6px 10px",
    lineHeight: 1.35,
  },
  pillGroup: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
  },
  snippet: {
    color: "color-mix(in srgb, currentColor 78%, transparent)",
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  list: {
    display: "grid",
    gap: 10,
  },
  threadList: {
    display: "grid",
    gap: 16,
  },
  threadGroup: {
    display: "grid",
    gap: 8,
  },
  rowList: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    display: "grid",
    overflow: "hidden",
  },
  row: {
    borderTop: emailSeparatorBorder,
    display: "grid",
    gap: 10,
    padding: "10px 12px",
  },
  messageList: {
    border: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    borderRadius: 8,
    display: "grid",
    overflow: "hidden",
  },
  codeBlock: {
    background: "color-mix(in srgb, currentColor 6%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    borderRadius: 6,
    boxSizing: "border-box",
    color: "inherit",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.45,
    margin: 0,
    maxHeight: 220,
    maxWidth: "100%",
    overflow: "auto",
    padding: 10,
    whiteSpace: "pre-wrap",
  },
  pill: {
    border: "1px solid color-mix(in srgb, currentColor 15%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 68%, transparent)",
    fontSize: 11,
    lineHeight: 1,
    padding: "4px 7px",
    whiteSpace: "nowrap",
  },
  labelPill: {
    background: "color-mix(in srgb, currentColor 5%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 13%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 70%, transparent)",
    fontSize: 11,
    lineHeight: 1,
    padding: "4px 7px",
    whiteSpace: "nowrap",
  },
  stat: {
    background: "color-mix(in srgb, currentColor 6%, transparent)",
    borderRadius: 6,
    display: "grid",
    gap: 3,
    padding: "10px 12px",
  },
  statGrid: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  },
};

export function GmailToolOutput({
  className,
  output,
  toolName,
}: GmailToolOutputProps) {
  if (toolName === "listGmailDrafts") {
    return (
      <GmailDrafts className={className} output={output as ListGmailDraftsOutput} />
    );
  }

  if (toolName === "getGmailDraft") {
    return <GmailDraft className={className} draft={output as GetGmailDraftOutput} />;
  }

  if (toolName === "listGmailLabels") {
    return (
      <GmailLabels className={className} output={output as ListGmailLabelsOutput} />
    );
  }

  if (toolName === "getGmailLabel") {
    return <GmailLabelCard className={className} label={output as GmailLabel} />;
  }

  if (toolName === "searchGmailMessages") {
    return (
      <GmailSearchResults
        className={className}
        output={output as SearchGmailMessagesOutput}
      />
    );
  }

  if (toolName === "listGmailThreads") {
    return (
      <GmailThreads className={className} output={output as ListGmailThreadsOutput} />
    );
  }

  if (toolName === "getGmailThread") {
    return (
      <GmailThread className={className} output={output as GetGmailThreadOutput} />
    );
  }

  if (toolName === "getGmailMessage") {
    return (
      <GmailMessage className={className} message={output as GmailMessageSummary} />
    );
  }

  if (toolName === "listGmailMessageAttachments") {
    return (
      <GmailAttachments
        className={className}
        output={output as ListGmailMessageAttachmentsOutput}
      />
    );
  }

  if (toolName === "getGmailMessageAttachment") {
    return (
      <GmailAttachment
        className={className}
        output={output as GetGmailMessageAttachmentOutput}
      />
    );
  }

  if (toolName === "getGmailProfile") {
    return <GmailProfileCard className={className} profile={output as GmailProfile} />;
  }

  if (toolName === "listGmailHistory") {
    return (
      <GmailHistoryList
        className={className}
        output={output as ListGmailHistoryOutput}
      />
    );
  }

  if (toolName === "getGmailRawMessage") {
    return (
      <GmailRawMessage
        className={className}
        output={output as GetGmailRawMessageOutput}
      />
    );
  }

  return null;
}

export function isGmailToolName(toolName: string): toolName is GmailToolName {
  return (
    toolName === "getGmailDraft" ||
    toolName === "getGmailLabel" ||
    toolName === "getGmailMessage" ||
    toolName === "getGmailMessageAttachment" ||
    toolName === "getGmailProfile" ||
    toolName === "getGmailRawMessage" ||
    toolName === "getGmailThread" ||
    toolName === "listGmailHistory" ||
    toolName === "listGmailDrafts" ||
    toolName === "listGmailLabels" ||
    toolName === "listGmailMessageAttachments" ||
    toolName === "listGmailThreads" ||
    toolName === "searchGmailMessages"
  );
}

function GmailSearchResults({
  className,
  output,
}: {
  className?: string;
  output: SearchGmailMessagesOutput;
}) {
  const messages = output.messages ?? [];
  const [isExpanded, setIsExpanded] = useState(true);
  const countLabel =
    typeof output.resultSizeEstimate === "number"
      ? `${output.resultSizeEstimate} estimated`
      : `${messages.length} shown`;

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.searchHeader}>
        <div>
          <SourceTitle iconSrc={gmailIconSrc} title="Matching messages" />
          <div style={styles.searchSummary}>
            {messages.length
              ? `${messages.length} messages shown from Gmail`
              : "No messages returned from Gmail"}
          </div>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.pill}>{countLabel}</span>
          <button
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Hide Gmail results" : "Show Gmail results"}
            onClick={() => setIsExpanded((current) => !current)}
            style={styles.toggleButton}
            type="button"
          >
            <ChevronIcon expanded={isExpanded} />
          </button>
        </div>
      </div>
      <div
        style={{
          ...styles.collapseRegion,
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          marginTop: isExpanded ? 0 : -6,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div style={styles.collapseInner}>
          <EmailInboxWidget messages={messages} />
          {output.nextPageToken ? (
            <div style={{ ...styles.meta, paddingTop: 2 }}>
              More results are available in Gmail.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GmailLabels({
  className,
  output,
}: {
  className?: string;
  output: ListGmailLabelsOutput;
}) {
  const labels = output.labels ?? [];

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <Title kicker="Gmail labels" title="Mailbox labels" />
        <span style={styles.pill}>{labels.length} labels</span>
      </div>
      <div style={styles.rowList}>
        {labels.length ? (
          labels.map((label, index) => (
            <div
              key={label.id}
              style={{ ...styles.row, borderTop: index === 0 ? 0 : emailSeparatorBorder }}
            >
              <div style={styles.header}>
                <div>
                  <div style={styles.title}>{label.name}</div>
                  <div style={{ ...styles.meta, marginTop: 4 }}>
                    {metadataItem("ID", label.id)}
                    {metadataItem("Type", label.type)}
                    {metadataItem("Visibility", label.labelListVisibility)}
                  </div>
                </div>
                <span style={styles.pill}>{label.type ?? "label"}</span>
              </div>
              <div style={styles.meta}>
                <span>{formatNumber(label.messagesUnread)} unread messages</span>
                <span>{formatNumber(label.messagesTotal)} total messages</span>
                <span>{formatNumber(label.threadsUnread)} unread threads</span>
              </div>
            </div>
          ))
        ) : (
          <div style={{ ...styles.empty, minHeight: 120 }}>No labels returned</div>
        )}
      </div>
    </section>
  );
}

function GmailDrafts({
  className,
  output,
}: {
  className?: string;
  output: ListGmailDraftsOutput;
}) {
  const drafts = output.drafts ?? [];
  const countLabel =
    typeof output.resultSizeEstimate === "number"
      ? `${output.resultSizeEstimate} estimated`
      : `${drafts.length} shown`;

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <Title kicker="Gmail drafts" title="Draft messages" />
        <span style={styles.pill}>{countLabel}</span>
      </div>
      <div style={styles.list}>
        {drafts.length ? (
          drafts.map((draft) => <GmailDraft draft={draft} key={draft.id} />)
        ) : (
          <div style={styles.card}>No drafts returned from Gmail.</div>
        )}
      </div>
      {output.nextPageToken ? (
        <div style={styles.meta}>More drafts are available in Gmail.</div>
      ) : null}
    </section>
  );
}

function GmailDraft({
  className,
  draft,
}: {
  className?: string;
  draft: GetGmailDraftOutput;
}) {
  return (
    <section className={className} style={styles.card}>
      {draft.message ? (
        <>
          <div style={styles.header}>
            <MessageHeading message={draft.message} />
            <span style={styles.pill}>Draft</span>
          </div>
          {draft.message.bodyHtml || draft.message.bodyText ? (
            <EmailFrame message={draft.message} />
          ) : draft.message.snippet ? (
            <p style={styles.snippet}>{draft.message.snippet}</p>
          ) : null}
        </>
      ) : (
        <Title kicker="Gmail draft" title={draft.id} />
      )}
      <div style={styles.meta}>{metadataItem("Draft", draft.id)}</div>
    </section>
  );
}

function GmailLabelCard({
  className,
  label,
}: {
  className?: string;
  label: GmailLabel;
}) {
  return (
    <section className={className} style={styles.card}>
      <div style={styles.header}>
        <Title kicker="Gmail label" title={label.name} />
        <span style={styles.pill}>{label.type ?? "label"}</span>
      </div>
      <div style={styles.statGrid}>
        <Stat label="Messages" value={formatNumber(label.messagesTotal)} />
        <Stat label="Unread" value={formatNumber(label.messagesUnread)} />
        <Stat label="Threads" value={formatNumber(label.threadsTotal)} />
        <Stat label="Unread Threads" value={formatNumber(label.threadsUnread)} />
      </div>
      <div style={styles.meta}>
        {metadataItem("ID", label.id)}
        {metadataItem("Label visibility", label.labelListVisibility)}
        {metadataItem("Message visibility", label.messageListVisibility)}
      </div>
    </section>
  );
}

function GmailThreads({
  className,
  output,
}: {
  className?: string;
  output: ListGmailThreadsOutput;
}) {
  const threads = output.threads ?? [];
  const countLabel =
    typeof output.resultSizeEstimate === "number"
      ? `${output.resultSizeEstimate} estimated`
      : `${threads.length} shown`;

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <Title kicker="Gmail threads" title="Matching conversations" />
        <span style={styles.pill}>{countLabel}</span>
      </div>
      <div style={styles.threadList}>
        {threads.length ? (
          threads.map((thread) => <ThreadRow key={thread.id} thread={thread} />)
        ) : (
          <div style={{ ...styles.empty, minHeight: 120 }}>
            No threads returned from Gmail.
          </div>
        )}
      </div>
      {output.nextPageToken ? (
        <div style={styles.meta}>More thread results are available in Gmail.</div>
      ) : null}
    </section>
  );
}

function ThreadRow({
  thread,
}: {
  thread: GetGmailThreadOutput;
}) {
  const messages = thread.messages ?? [];
  const latestMessage = messages.at(-1);
  const senderSummary = summarizeThreadSenders(messages);

  return (
    <section style={styles.threadGroup}>
      <div style={styles.header}>
        <div>
          <Title kicker="Gmail thread" title={threadTitle(messages, thread.id)} />
          <div style={{ ...styles.meta, marginTop: 6 }}>
            {senderSummary ? <span>{senderSummary}</span> : null}
            {latestMessage
              ? metadataItem(
                  "Latest",
                  formatDate(latestMessage.date ?? latestMessage.internalDate),
                )
              : null}
          </div>
        </div>
        <div style={styles.pillGroup}>
          <span style={styles.pill}>{messages.length} messages</span>
          <ThreadBadges messages={messages} maxLabels={2} />
        </div>
      </div>
      {messages.length ? (
        <ThreadMessagesList messages={messages} />
      ) : thread.snippet ? (
        <p style={styles.snippet}>{thread.snippet}</p>
      ) : null}
    </section>
  );
}

function EmailInboxWidget({ messages }: { messages: GmailMessageSummary[] }) {
  const [selectedEmail, setSelectedEmail] = useState<GmailMessageSummary | null>(
    null,
  );

  const handleEmailClick = (email: GmailMessageSummary) => {
    setSelectedEmail(email);
  };

  return (
    <div style={styles.inbox}>
      <div style={styles.inboxBody}>
        {messages.length === 0 ? (
          <div style={styles.empty}>
            <MailGlyph />
            <span>No emails found</span>
          </div>
        ) : (
          messages.map((email, index) => (
            <EmailSummaryButton
              email={email}
              index={index}
              key={email.id}
              onClick={() => handleEmailClick(email)}
            />
          ))
        )}
      </div>
      {selectedEmail ? (
        <EmailDialog
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      ) : null}
    </div>
  );
}

function EmailSummaryButton({
  email,
  index,
  onClick,
  showBadges = false,
}: {
  email: GmailMessageSummary;
  index: number;
  onClick: () => void;
  showBadges?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(event) => {
        event.currentTarget.style.background =
          "color-mix(in srgb, currentColor 6%, transparent)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
      style={{
        ...styles.emailButton,
        borderTop: index === 0 ? 0 : emailSeparatorBorder,
      }}
      type="button"
    >
      <SenderAvatar message={email} />
      <div style={styles.emailMain}>
        <div style={styles.emailTopline}>
          <div style={styles.senderLine}>
            <span style={styles.sender}>{getSenderName(email.from)}</span>
            <span style={styles.address}>{getSenderAddress(email.from)}</span>
          </div>
          <span style={styles.date}>
            {formatInboxDate(email.date ?? email.internalDate)}
          </span>
        </div>
        <div style={styles.emailTopline}>
          <p style={styles.subject}>{email.subject ?? "(No subject)"}</p>
          {showBadges ? (
            <div style={styles.pillGroup}>
              <MessageBadges maxLabels={2} message={email} />
            </div>
          ) : null}
        </div>
        <p style={styles.preview}>
          {email.snippet ?? shorten(email.bodyText, 160) ?? ""}
        </p>
      </div>
    </button>
  );
}

function EmailDialog({
  email,
  onClose,
}: {
  email: GmailMessageSummary;
  onClose: () => void;
}) {
  return (
    <div
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={styles.overlay}
    >
      <div onClick={(event) => event.stopPropagation()} style={styles.dialog}>
        <div style={styles.dialogHeader}>
          <div style={styles.header}>
            <h3 style={styles.dialogTitle}>{email.subject ?? "(No subject)"}</h3>
            <button onClick={onClose} style={styles.closeButton} type="button">
              Close
            </button>
          </div>
          <div style={styles.header}>
            <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
              <SenderAvatar message={email} />
              <div>
                <div style={styles.sender}>{getSenderName(email.from)}</div>
                <div style={styles.address}>{email.from}</div>
              </div>
            </div>
            <span style={styles.date}>
              {formatInboxDate(email.date ?? email.internalDate)}
            </span>
          </div>
          {email.to ? (
            <div style={styles.meta}>
              <span>To: {email.to}</span>
            </div>
          ) : null}
        </div>
        <EmailFrame message={email} />
      </div>
    </div>
  );
}

function GmailThread({
  className,
  output,
}: {
  className?: string;
  output: GetGmailThreadOutput;
}) {
  const messages = output.messages ?? [];
  const senderSummary = summarizeThreadSenders(messages);

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <div>
          <Title kicker="Gmail thread" title={threadTitle(messages, output.id)} />
          {senderSummary ? (
            <div style={{ ...styles.meta, marginTop: 6 }}>
              <span>{senderSummary}</span>
            </div>
          ) : null}
        </div>
        <div style={styles.pillGroup}>
          <span style={styles.pill}>{messages.length} messages</span>
          <ThreadBadges messages={messages} maxLabels={2} />
        </div>
      </div>
      {messages.length ? (
        <ThreadMessagesList messages={messages} />
      ) : (
        <div style={{ ...styles.empty, minHeight: 120 }}>
          No messages returned for this thread.
        </div>
      )}
    </section>
  );
}

function GmailMessage({
  className,
  message,
}: {
  className?: string;
  message: GmailMessageSummary;
}) {
  return (
    <section className={className} style={styles.card}>
      <MessageHeading message={message} />
      <EmailFrame message={message} />
    </section>
  );
}

function GmailProfileCard({
  className,
  profile,
}: {
  className?: string;
  profile: GmailProfile;
}) {
  return (
    <section className={className} style={styles.card}>
      <Title kicker="Gmail profile" title={profile.emailAddress} />
      <div style={styles.statGrid}>
        <Stat label="Messages" value={formatNumber(profile.messagesTotal)} />
        <Stat label="Threads" value={formatNumber(profile.threadsTotal)} />
        <Stat label="History ID" value={profile.historyId ?? "Unavailable"} />
      </div>
    </section>
  );
}

function GmailAttachments({
  className,
  output,
}: {
  className?: string;
  output: ListGmailMessageAttachmentsOutput;
}) {
  const attachments = output.attachments ?? [];

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <div>
          <Title
            kicker="Gmail attachments"
            title={output.subject ?? "Message attachments"}
          />
          <div style={{ ...styles.meta, marginTop: 6 }}>
            {metadataItem("Message", output.messageId)}
            {metadataItem("Thread", output.threadId)}
          </div>
        </div>
        <span style={styles.pill}>{attachments.length} files</span>
      </div>
      <div style={styles.rowList}>
        {attachments.length ? (
          attachments.map((attachment, index) => (
            <AttachmentRow
              attachment={attachment}
              index={index}
              key={`${attachment.partId}-${attachment.attachmentId}`}
            />
          ))
        ) : (
          <div style={{ ...styles.empty, minHeight: 120 }}>
            No downloadable attachments found
          </div>
        )}
      </div>
    </section>
  );
}

function GmailAttachment({
  className,
  output,
}: {
  className?: string;
  output: GetGmailMessageAttachmentOutput;
}) {
  return (
    <section className={className} style={styles.card}>
      <div style={styles.header}>
        <Title kicker="Gmail attachment" title={output.attachmentId} />
        <span style={styles.pill}>{formatBytes(output.size)}</span>
      </div>
      <div style={styles.meta}>
        {metadataItem("Message", output.messageId)}
        {metadataItem("MIME", output.mimeType)}
        {output.isDataTruncated ? <span>Data truncated</span> : null}
      </div>
      {output.decodedText ? (
        <pre style={styles.codeBlock}>{output.decodedText}</pre>
      ) : output.dataBase64 ? (
        <pre style={styles.codeBlock}>{output.dataBase64}</pre>
      ) : (
        <p style={styles.snippet}>No attachment data returned.</p>
      )}
    </section>
  );
}

function GmailHistoryList({
  className,
  output,
}: {
  className?: string;
  output: ListGmailHistoryOutput;
}) {
  const history = output.history ?? [];

  return (
    <section className={className} style={styles.panel}>
      <div style={styles.header}>
        <Title kicker="Gmail history" title="Mailbox changes" />
        <span style={styles.pill}>{history.length} events</span>
      </div>
      <div style={styles.rowList}>
        {history.length ? (
          history.map((event, index) => (
            <div
              key={event.id ?? index}
              style={{ ...styles.row, borderTop: index === 0 ? 0 : emailSeparatorBorder }}
            >
              <div style={styles.header}>
                <div style={styles.title}>History {event.id ?? index + 1}</div>
                <span style={styles.pill}>
                  {historyEventCount(event)} changes
                </span>
              </div>
              <div style={styles.meta}>
                <span>{event.messagesAdded?.length ?? 0} added</span>
                <span>{event.messagesDeleted?.length ?? 0} deleted</span>
                <span>{event.labelsAdded?.length ?? 0} labels added</span>
                <span>{event.labelsRemoved?.length ?? 0} labels removed</span>
              </div>
              {event.messages?.length ? (
                <p style={styles.snippet}>
                  Messages:{" "}
                  {event.messages.map((message) => message.id).join(", ")}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div style={{ ...styles.empty, minHeight: 120 }}>No history returned</div>
        )}
      </div>
      <div style={styles.meta}>
        {metadataItem("Latest history ID", output.historyId)}
        {output.nextPageToken ? <span>More history is available.</span> : null}
      </div>
    </section>
  );
}

function GmailRawMessage({
  className,
  output,
}: {
  className?: string;
  output: GetGmailRawMessageOutput;
}) {
  return (
    <section className={className} style={styles.card}>
      <div style={styles.header}>
        <Title kicker="Gmail raw message" title={output.id} />
        <span style={styles.pill}>{formatBytes(output.sizeEstimate)}</span>
      </div>
      <div style={styles.meta}>
        {metadataItem("Thread", output.threadId)}
        {metadataItem("History", output.historyId)}
        {output.isRawTruncated ? <span>Raw data truncated</span> : null}
      </div>
      <pre style={styles.codeBlock}>{output.rawBase64 ?? "No raw data returned."}</pre>
    </section>
  );
}

function AttachmentRow({
  attachment,
  index,
}: {
  attachment: GmailAttachmentSummary;
  index: number;
}) {
  return (
    <div
      style={{ ...styles.row, borderTop: index === 0 ? 0 : emailSeparatorBorder }}
    >
      <div style={styles.header}>
        <div>
          <div style={styles.title}>
            {attachment.filename || attachment.mimeType || "Attachment"}
          </div>
          <div style={{ ...styles.meta, marginTop: 4 }}>
            {metadataItem("Attachment", attachment.attachmentId)}
            {metadataItem("Part", attachment.partId)}
            {metadataItem("MIME", attachment.mimeType)}
          </div>
        </div>
        <span style={styles.pill}>{formatBytes(attachment.size)}</span>
      </div>
    </div>
  );
}

function ThreadMessagesList({ messages }: { messages: GmailMessageSummary[] }) {
  const [selectedEmail, setSelectedEmail] = useState<GmailMessageSummary | null>(
    null,
  );

  return (
    <>
      <div style={styles.messageList}>
        {messages.map((message, index) => (
          <EmailSummaryButton
            email={message}
            index={index}
            key={message.id}
            onClick={() => setSelectedEmail(message)}
            showBadges
          />
        ))}
      </div>
      {selectedEmail ? (
        <EmailDialog
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      ) : null}
    </>
  );
}

function MessageHeading({ message }: { message: GmailMessageSummary }) {
  return (
    <div style={styles.header}>
      <div>
        <Title
          kicker={getSenderName(message.from)}
          title={message.subject ?? "(No subject)"}
        />
        <div style={{ ...styles.meta, marginTop: 6 }}>
          {metadataItem("From", getSenderAddress(message.from))}
          {metadataItem("To", message.to)}
          {metadataItem("Date", formatDate(message.date ?? message.internalDate))}
        </div>
      </div>
      <div style={styles.pillGroup}>
        <span style={styles.pill}>Email</span>
        <MessageBadges message={message} />
      </div>
    </div>
  );
}

function SenderAvatar({ message }: { message: GmailMessageSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = getSenderName(message.from).charAt(0).toUpperCase() || "?";
  const shouldShowImage = message.senderPhotoUrl && !imageFailed;

  return (
    <div style={styles.avatar}>
      {shouldShowImage ? (
        <img
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            setImageFailed(true);
          }}
          src={message.senderPhotoUrl}
          style={styles.avatarImage}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function MessageBadges({
  maxLabels = 3,
  message,
}: {
  maxLabels?: number;
  message: GmailMessageSummary;
}) {
  return (
    <MessageBadgeList
      attachmentCount={message.attachments?.length ?? 0}
      labelIds={message.labelIds ?? []}
      maxLabels={maxLabels}
    />
  );
}

function ThreadBadges({
  maxLabels = 3,
  messages,
}: {
  maxLabels?: number;
  messages: GmailMessageSummary[];
}) {
  const labelIds = Array.from(
    new Set(messages.flatMap((message) => message.labelIds ?? [])),
  );
  const attachmentCount = messages.reduce(
    (count, message) => count + (message.attachments?.length ?? 0),
    0,
  );

  return (
    <MessageBadgeList
      attachmentCount={attachmentCount}
      labelIds={labelIds}
      maxLabels={maxLabels}
    />
  );
}

function MessageBadgeList({
  attachmentCount,
  labelIds,
  maxLabels,
}: {
  attachmentCount: number;
  labelIds: string[];
  maxLabels: number;
}) {
  const labels = labelIds.slice(0, maxLabels);
  const hiddenLabelCount = Math.max(labelIds.length - labels.length, 0);

  return (
    <>
      {labels.map((labelId) => (
        <span key={labelId} style={styles.labelPill}>
          {formatLabelId(labelId)}
        </span>
      ))}
      {hiddenLabelCount ? (
        <span style={styles.labelPill}>+{hiddenLabelCount}</span>
      ) : null}
      {attachmentCount ? (
        <span style={styles.labelPill}>
          {attachmentCount} {attachmentCount === 1 ? "attachment" : "attachments"}
        </span>
      ) : null}
    </>
  );
}

function EmailFrame({ message }: { message: GmailMessageSummary }) {
  return (
    <iframe
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={
        message.bodyHtml
          ? toEmailFrameDocument(message.bodyHtml)
          : toPlainTextEmailFrameDocument(message.bodyText ?? message.snippet ?? "")
      }
      style={styles.emailFrame}
      title={message.subject ?? "Email message"}
    />
  );
}

function SourceTitle({ iconSrc, title }: { iconSrc: string; title: ReactNode }) {
  return (
    <div style={styles.sourceTitle}>
      <img alt="" aria-hidden="true" src={iconSrc} style={styles.sourceIcon} />
      <div style={{ ...styles.title, marginTop: 0 }}>{title}</div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 140ms ease",
      }}
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Title({ kicker, title }: { kicker: ReactNode; title: ReactNode }) {
  return (
    <div>
      <div style={styles.kicker}>{kicker}</div>
      <div style={styles.title}>{title}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <span style={styles.kicker}>{label}</span>
      <span style={styles.title}>{value}</span>
    </div>
  );
}

function metadataItem(label: string, value?: string) {
  return value ? (
    <span>
      {label}: {value}
    </span>
  ) : null;
}

function getSenderName(from?: string) {
  if (!from) {
    return "Unknown sender";
  }

  const match = from.match(/^([^<]+)/);
  return (match?.[1]?.trim() || from);
}

function getSenderAddress(from?: string) {
  if (!from) {
    return "";
  }

  return from.match(/<(.+?)>/)?.[1] ?? from;
}

function summarizeThreadSenders(messages: GmailMessageSummary[]) {
  const senders = Array.from(
    new Set(
      messages
        .map((message) => getSenderName(message.from))
        .filter((sender) => sender && sender !== "Unknown sender"),
    ),
  );

  if (!senders.length) {
    return undefined;
  }

  if (senders.length <= 2) {
    return senders.join(", ");
  }

  return `${senders.slice(0, 2).join(", ")} +${senders.length - 2} more`;
}

function threadTitle(messages: GmailMessageSummary[], fallback: string) {
  return messages.find((message) => message.subject)?.subject ?? fallback;
}

function formatLabelId(labelId: string) {
  const systemLabels: Record<string, string> = {
    CATEGORY_FORUMS: "Forums",
    CATEGORY_PERSONAL: "Personal",
    CATEGORY_PROMOTIONS: "Promotions",
    CATEGORY_SOCIAL: "Social",
    CATEGORY_UPDATES: "Updates",
    DRAFT: "Draft",
    IMPORTANT: "Important",
    INBOX: "Inbox",
    SENT: "Sent",
    SPAM: "Spam",
    STARRED: "Starred",
    TRASH: "Trash",
    UNREAD: "Unread",
  };

  return (
    systemLabels[labelId] ??
    labelId
      .replace(/^Label_/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatInboxDate(value?: string) {
  if (!value) {
    return "";
  }

  const date =
    /^\d+$/.test(value) ? new Date(Number.parseInt(value, 10)) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function MailGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="32"
      viewBox="0 0 24 24"
      width="32"
    >
      <path
        d="M4 6.5h16v11H4z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m5 7 7 5.25L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function toEmailFrameDocument(html: string) {
  return `<!doctype html>
<html>
  <head>
    <base target="_blank" />
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html { margin: 0; padding: 0; background: #fff; color: #111827; overflow-y: scroll; }
      body { margin: 0; padding: 0; overflow-wrap: anywhere; }
      img, table { max-width: 100% !important; }
    </style>
  </head>
  <body>${sanitizeEmailHtml(html)}</body>
</html>`;
}

function toPlainTextEmailFrameDocument(text: string) {
  return toEmailFrameDocument(
    `<main style="box-sizing:border-box;margin:0 auto;max-width:720px;padding:32px 24px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;white-space:pre-wrap;">${linkifyEscapedText(text)}</main>`,
  );
}

function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<a\b([^>]*)>/gi, (_match, attributes: string) => {
      const withoutTarget = attributes.replace(/\starget\s*=\s*(['"]).*?\1/gi, "");
      const withoutRel = withoutTarget.replace(/\srel\s*=\s*(['"]).*?\1/gi, "");
      return `<a${withoutRel} target="_blank" rel="noopener noreferrer">`;
    });
}

function linkifyEscapedText(text: string) {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>',
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date =
    /^\d+$/.test(value) ? new Date(Number.parseInt(value, 10)) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "Unavailable";
}

function formatBytes(value?: number) {
  if (typeof value !== "number") {
    return "Unknown size";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function historyEventCount(event: GmailHistory) {
  return (
    (event.messages?.length ?? 0) +
    (event.messagesAdded?.length ?? 0) +
    (event.messagesDeleted?.length ?? 0) +
    (event.labelsAdded?.length ?? 0) +
    (event.labelsRemoved?.length ?? 0)
  );
}

function shorten(value: string | undefined, maxLength: number) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
