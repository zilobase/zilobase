"use client";

import { useState, type CSSProperties } from "react";

const slackIconSrc = "/icons/slack.svg";

export type SlackToolName =
  | "getSlackConversationHistory"
  | "getSlackFileInfo"
  | "getSlackProfile"
  | "getSlackThread"
  | "getSlackUser"
  | "listSlackCanvases"
  | "listSlackConversations"
  | "listSlackFiles"
  | "lookupSlackCanvasSections"
  | "searchSlackMessages";

export type SlackToolOutputProps = {
  channels?: string[];
  className?: string;
  errorText?: string;
  input?: unknown;
  output?: unknown;
  toolName: SlackToolName;
};

const styles: Record<string, CSSProperties> = {
  card: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    boxSizing: "border-box",
    color: "inherit",
    display: "grid",
    gap: 12,
    maxWidth: "100%",
    padding: 16,
    width: "100%",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
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
  main: {
    display: "grid",
    flex: "1 1 auto",
    gap: 5,
    minWidth: 0,
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
    color: "color-mix(in srgb, currentColor 92%, transparent)",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flex: "0 0 auto",
    gap: 6,
  },
  pill: {
    border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
    borderRadius: 999,
    color: "color-mix(in srgb, currentColor 66%, transparent)",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    padding: "4px 7px",
    whiteSpace: "nowrap",
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
    display: "grid",
    gap: 12,
    minHeight: 0,
    overflow: "hidden",
  },
  guide: {
    alignItems: "center",
    borderTop: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    display: "flex",
    flexWrap: "wrap",
    gap: "10px 12px",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  body: {
    color: "color-mix(in srgb, currentColor 64%, transparent)",
    fontSize: 12,
    lineHeight: 1.45,
    margin: 0,
  },
  inlineCommand: {
    background: "color-mix(in srgb, currentColor 7%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    borderRadius: 5,
    color: "color-mix(in srgb, currentColor 78%, transparent)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1,
    padding: "2px 5px",
    whiteSpace: "nowrap",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  button: {
    alignItems: "center",
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 7,
    color: "color-mix(in srgb, currentColor 86%, transparent)",
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    lineHeight: 1,
    minHeight: 32,
    padding: "8px 10px",
    textDecoration: "none",
  },
  primaryButton: {
    background: "#611f69",
    borderColor: "#611f69",
    color: "#ffffff",
  },
  meta: {
    color: "color-mix(in srgb, currentColor 52%, transparent)",
    fontSize: 11,
    lineHeight: 1.35,
    margin: 0,
  },
  collapsedMeta: {
    color: "color-mix(in srgb, currentColor 58%, transparent)",
    fontSize: 11,
    lineHeight: 1.35,
    marginTop: 2,
  },
};

const slackInviteDocsUrl =
  "https://slack.com/help/articles/201980108-Add-people-to-a-channel";

export function SlackToolOutput({
  channels,
  className,
  errorText,
  input,
  toolName,
}: SlackToolOutputProps) {
  if (!errorText?.includes("not_in_channel")) {
    return null;
  }

  const channelIds = channels?.length
    ? Array.from(new Set(channels.map((channel) => channel.trim()).filter(Boolean)))
    : getChannelId(input)
      ? [getChannelId(input) as string]
      : [];
  const firstChannel = channelIds[0];
  const channelUrl = firstChannel
    ? `https://slack.com/app_redirect?channel=${encodeURIComponent(firstChannel)}`
    : "https://slack.com/app_redirect";
  const channelCount = channelIds.length;
  const [isExpanded, setIsExpanded] = useState(true);
  const countLabel = channelCount
    ? `${channelCount} ${channelCount === 1 ? "channel" : "channels"}`
    : "Slack";

  return (
    <section className={className} style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.sourceTitle}>
            <img
              alt=""
              aria-hidden="true"
              src={slackIconSrc}
              style={styles.sourceIcon}
            />
            <div style={styles.title}>
              Slack access needed
            </div>
          </div>
          <div style={styles.collapsedMeta}>
            {channelCount > 1
              ? `Invite Notelab to ${channelCount} channels`
              : "Invite Notelab to this channel"}
          </div>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.pill}>{countLabel}</span>
          <button
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Hide Slack details" : "Show Slack details"}
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
          <div style={styles.main}>
            <p style={styles.body}>
              Slack blocked this read because the Notelab app is not a member of
              {channelCount > 1 ? " these channels" : " the channel"}. Open Slack, run{" "}
              <code style={styles.inlineCommand}>/invite @notelab</code>, then retry
              the request in Notelab.
            </p>
          </div>
          <div style={styles.guide}>
            {channelIds.length ? (
              <p style={styles.meta}>
                Channel {channelIds.length === 1 ? "id" : "ids"}:{" "}
                {channelIds.join(", ")}
              </p>
            ) : (
              <p style={styles.meta}>
                No channel id was attached to this {toolName} call.
              </p>
            )}
            <div style={styles.actions}>
              <a
                href={slackInviteDocsUrl}
                rel="noopener noreferrer"
                style={styles.button}
                target="_blank"
              >
                Invite docs
              </a>
              <a
                href={channelUrl}
                rel="noopener noreferrer"
                style={{ ...styles.button, ...styles.primaryButton }}
                target="_blank"
              >
                {channelCount > 1 ? "Open first channel" : "Open Slack channel"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
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

export function isSlackToolName(toolName: string): toolName is SlackToolName {
  return (
    toolName === "getSlackConversationHistory" ||
    toolName === "getSlackFileInfo" ||
    toolName === "getSlackProfile" ||
    toolName === "getSlackThread" ||
    toolName === "getSlackUser" ||
    toolName === "listSlackCanvases" ||
    toolName === "listSlackConversations" ||
    toolName === "listSlackFiles" ||
    toolName === "lookupSlackCanvasSections" ||
    toolName === "searchSlackMessages"
  );
}

function getChannelId(input: unknown) {
  if (!input || typeof input !== "object" || !("channel" in input)) {
    return undefined;
  }

  const channel = input.channel;
  return typeof channel === "string" && channel.trim()
    ? channel.trim()
    : undefined;
}
