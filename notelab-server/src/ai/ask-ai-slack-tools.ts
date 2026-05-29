import { SlackReadonlyClient } from "../../../notelab-client/src/connectors/slack/src/index.js";
import { tool, type ToolSet } from "ai";
import * as z from "zod";

import { truncateText } from "./ask-ai-utils";

export function buildSlackTools(accessToken: string): ToolSet {
  const slack = new SlackReadonlyClient({
    accessToken,
    fetch: (input, init) => fetch(input, init),
  });

  return {
    listSlackConversations: tool({
      description:
        "List Slack conversations the app can see. Use this to find channel ids before reading history.",
      inputSchema: z.object({
        cursor: z.string().trim().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        types: z
          .array(z.enum(["public_channel", "private_channel"]))
          .default(["public_channel", "private_channel"]),
      }),
      execute: async ({ cursor, limit, types }) => {
        const results = await slack.listConversations({
          cursor,
          excludeArchived: true,
          limit,
          types,
        });

        return {
          conversations: (results.channels ?? []).map((conversation) => ({
            id: conversation.id,
            isMember: conversation.is_member,
            isPrivate: conversation.is_private,
            name: conversation.name,
            numMembers: conversation.num_members,
            purpose: conversation.purpose?.value,
            topic: conversation.topic?.value,
          })),
          nextCursor: results.response_metadata?.next_cursor,
        };
      },
    }),
    getSlackConversationHistory: tool({
      description:
        "Read recent Slack messages from a conversation or channel by id.",
      inputSchema: z.object({
        channel: z.string().trim().min(1),
        cursor: z.string().trim().optional(),
        latest: z.string().trim().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        oldest: z.string().trim().optional(),
      }),
      execute: async ({ channel, cursor, latest, limit, oldest }) => {
        const results = await slack.getConversationHistory({
          channel,
          cursor,
          latest,
          limit,
          oldest,
        });

        return {
          hasMore: results.has_more,
          messages: (results.messages ?? []).map(toSlackMessageSummary),
          nextCursor: results.response_metadata?.next_cursor,
        };
      },
    }),
    getSlackThread: tool({
      description:
        "Read a Slack message thread by channel id and parent message timestamp.",
      inputSchema: z.object({
        channel: z.string().trim().min(1),
        cursor: z.string().trim().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        ts: z.string().trim().min(1),
      }),
      execute: async ({ channel, cursor, limit, ts }) => {
        const results = await slack.getConversationReplies({
          channel,
          cursor,
          limit,
          ts,
        });

        return {
          hasMore: results.has_more,
          messages: (results.messages ?? []).map(toSlackMessageSummary),
          nextCursor: results.response_metadata?.next_cursor,
        };
      },
    }),
    getSlackProfile: tool({
      description:
        "Read the connected Slack auth profile and workspace information.",
      inputSchema: z.object({}),
      execute: async () => slack.authTest(),
    }),
    listSlackFiles: tool({
      description:
        "List Slack files the app can see, optionally filtered by channel, user, timestamp range, or file type.",
      inputSchema: z.object({
        channel: z.string().trim().optional(),
        count: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).optional(),
        teamId: z.string().trim().optional(),
        tsFrom: z
          .string()
          .trim()
          .optional()
          .describe("Unix timestamp lower bound for file creation."),
        tsTo: z
          .string()
          .trim()
          .optional()
          .describe("Unix timestamp upper bound for file creation."),
        types: z
          .string()
          .trim()
          .default("all")
          .describe("Slack file type filter, for example all, images, pdfs, snippets, spaces, gdocs, or zips."),
        user: z.string().trim().optional(),
      }),
      execute: async ({
        channel,
        count,
        page,
        teamId,
        tsFrom,
        tsTo,
        types,
        user,
      }) => {
        const results = await slack.listFiles({
          channel,
          count,
          page,
          teamId,
          tsFrom,
          tsTo,
          types,
          user,
        });

        return {
          files: (results.files ?? []).map(toSlackFileSummary),
          paging: results.paging,
        };
      },
    }),
    getSlackFileInfo: tool({
      description:
        "Read metadata for a Slack file by file id. Use this after listSlackFiles or Slack search returns a file reference.",
      inputSchema: z.object({
        cursor: z.string().trim().optional(),
        file: z.string().trim().min(1),
        limit: z.number().int().min(1).max(200).default(20),
      }),
      execute: async ({ cursor, file, limit }) => {
        const results = await slack.getFileInfo({ cursor, file, limit });

        return {
          comments: results.comments?.map((comment) => ({
            comment: truncateText(comment.comment, 2000),
            created: comment.created,
            id: comment.id,
            timestamp: comment.timestamp,
            user: comment.user,
          })),
          file: results.file ? toSlackFileSummary(results.file) : undefined,
          nextCursor: results.response_metadata?.next_cursor,
        };
      },
    }),
    listSlackCanvases: tool({
      description:
        "List Slack canvases visible to the app. Use this to find canvas ids before looking up canvas sections.",
      inputSchema: z.object({
        channel: z.string().trim().optional(),
        count: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).optional(),
        teamId: z.string().trim().optional(),
        tsFrom: z
          .string()
          .trim()
          .optional()
          .describe("Unix timestamp lower bound for canvas creation."),
        tsTo: z
          .string()
          .trim()
          .optional()
          .describe("Unix timestamp upper bound for canvas creation."),
        user: z.string().trim().optional(),
      }),
      execute: async ({
        channel,
        count,
        page,
        teamId,
        tsFrom,
        tsTo,
        user,
      }) => {
        const results = await slack.listFiles({
          channel,
          count,
          page,
          teamId,
          tsFrom,
          tsTo,
          types: "canvas",
          user,
        });

        return {
          canvases: (results.files ?? []).map(toSlackFileSummary),
          paging: results.paging,
        };
      },
    }),
    lookupSlackCanvasSections: tool({
      description:
        "Look up Slack canvas section ids by matching text or header section types. This returns matching section ids, not a full canvas export.",
      inputSchema: z.object({
        canvasId: z
          .string()
          .trim()
          .min(1)
          .describe("Slack canvas id, commonly returned by listSlackCanvases."),
        containsText: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Optional text to match inside canvas sections."),
        sectionTypes: z
          .array(z.enum(["h1", "h2", "h3", "any_header"]))
          .default(["any_header"])
          .describe("Canvas section types to match."),
      }),
      execute: async ({ canvasId, containsText, sectionTypes }) => {
        const results = await slack.lookupCanvasSections({
          canvasId,
          criteria: {
            contains_text: containsText,
            section_types: sectionTypes,
          },
        });

        return {
          sections: results.sections ?? [],
        };
      },
    }),
  };
}

function toSlackMessageSummary(message: {
  bot_id?: string;
  channel?: string;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts: string;
  type?: string;
  user?: string;
}) {
  return {
    botId: message.bot_id,
    channel: message.channel,
    subtype: message.subtype,
    text: truncateText(message.text, 3000),
    threadTs: message.thread_ts,
    ts: message.ts,
    type: message.type,
    user: message.user,
  };
}

function toSlackFileSummary(file: {
  alt_txt?: string;
  channels?: string[];
  comments_count?: number;
  created?: number;
  filetype?: string;
  groups?: string[];
  id: string;
  ims?: string[];
  is_external?: boolean;
  is_public?: boolean;
  mimetype?: string;
  name?: string;
  permalink?: string;
  pretty_type?: string;
  size?: number;
  title?: string;
  url_private?: string;
  user?: string;
}) {
  return {
    altText: file.alt_txt,
    channels: file.channels,
    commentsCount: file.comments_count,
    created: file.created,
    filetype: file.filetype,
    groups: file.groups,
    id: file.id,
    ims: file.ims,
    isExternal: file.is_external,
    isPublic: file.is_public,
    mimetype: file.mimetype,
    name: file.name,
    permalink: file.permalink,
    prettyType: file.pretty_type,
    size: file.size,
    title: file.title,
    urlPrivate: file.url_private,
    user: file.user,
  };
}
