import {
  decodeGmailBodyData,
  GmailReadonlyClient,
  summarizeGmailMessage,
  type GmailMessage,
  type GmailMessagePart,
} from "../../../notelab-client/src/connectors/gmail/src/index.js";
import { tool, type ToolSet } from "ai";
import * as z from "zod";

import { truncateText } from "./ask-ai-utils";

type GmailMessageSummary = ReturnType<typeof summarizeGmailMessage>;

export function buildGmailTools(accessToken: string): ToolSet {
  const gmail = new GmailReadonlyClient({
    accessToken,
    fetch: (input, init) => fetch(input, init),
  });
  const resolveSenderPhotoUrl = createSenderPhotoResolver(gmail);

  return {
    listGmailLabels: tool({
      description:
        "List Gmail labels, including system/user labels and unread/total mailbox counts per label.",
      inputSchema: z.object({}),
      execute: async () => gmail.listLabels(),
    }),
    getGmailLabel: tool({
      description:
        "Read details for a single Gmail label by label id, including visibility and count metadata.",
      inputSchema: z.object({
        labelId: z.string().trim().min(1),
      }),
      execute: async ({ labelId }) => gmail.getLabel(labelId),
    }),
    listGmailDrafts: tool({
      description:
        "List Gmail drafts and return concise summaries of the draft messages.",
      inputSchema: z.object({
        maxResults: z.number().int().min(1).max(10).default(5),
        pageToken: z.string().trim().optional(),
      }),
      execute: async ({ maxResults, pageToken }) => {
        const list = await gmail.listDrafts({ maxResults, pageToken });
        const drafts = await Promise.all(
          (list.drafts ?? []).map(async (draft) => {
            if (!draft.message) {
              return {
                id: draft.id,
              };
            }

            return {
              id: draft.id,
              message: truncateMessageSummary(
                await summarizeGmailMessageWithHtml(
                  gmail,
                  draft.message,
                  resolveSenderPhotoUrl,
                ),
              ),
            };
          }),
        );

        return {
          drafts,
          nextPageToken: list.nextPageToken,
          resultSizeEstimate: list.resultSizeEstimate,
        };
      },
    }),
    getGmailDraft: tool({
      description:
        "Read a Gmail draft by draft id and return the embedded draft message summary.",
      inputSchema: z.object({
        draftId: z.string().trim().min(1),
      }),
      execute: async ({ draftId }) => {
        const draft = await gmail.getDraft(draftId, {
          format: "full",
        });

        return {
          id: draft.id,
          message: draft.message
            ? truncateMessageSummary(
                await summarizeGmailMessageWithHtml(
                  gmail,
                  draft.message,
                  resolveSenderPhotoUrl,
                ),
                6000,
              )
            : undefined,
        };
      },
    }),
    searchGmailMessages: tool({
      description:
        "Search Gmail messages using Gmail search syntax and return concise message summaries.",
      inputSchema: z.object({
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum messages to inspect."),
        query: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Gmail search query, for example 'project alpha newer_than:30d' or 'from:alex@example.com subject:contract'.",
          ),
      }),
      execute: async ({ query, maxResults }) => {
        const list = await gmail.listMessages({ maxResults, query });
        const messages = await Promise.all(
          (list.messages ?? []).map(async (message) => {
            const fullMessage = await gmail.getMessage(message.id, {
              format: "full",
            });
            return truncateMessageSummary(
              await summarizeGmailMessageWithHtml(
                gmail,
                fullMessage,
                resolveSenderPhotoUrl,
              ),
            );
          }),
        );

        return {
          messages,
          nextPageToken: list.nextPageToken,
          resultSizeEstimate: list.resultSizeEstimate,
        };
      },
    }),
    listGmailThreads: tool({
      description:
        "Search or list Gmail threads and return thread summaries with the first few messages in each thread.",
      inputSchema: z.object({
        includeSpamTrash: z.boolean().default(false),
        labelIds: z.array(z.string().trim().min(1)).default([]),
        maxMessagesPerThread: z.number().int().min(1).max(10).default(3),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum threads to inspect."),
        pageToken: z.string().trim().optional(),
        query: z
          .string()
          .trim()
          .optional()
          .describe(
            "Optional Gmail search query, for example 'label:inbox newer_than:7d'.",
          ),
      }),
      execute: async ({
        includeSpamTrash,
        labelIds,
        maxMessagesPerThread,
        maxResults,
        pageToken,
        query,
      }) => {
        const list = await gmail.listThreads({
          includeSpamTrash,
          labelIds,
          maxResults,
          pageToken,
          query,
        });
        const threads = await Promise.all(
          (list.threads ?? []).map(async (thread) => {
            const fullThread = await gmail.getThread(thread.id, {
              format: "full",
            });

            return {
              historyId: fullThread.historyId ?? thread.historyId,
              id: thread.id,
              messages: await Promise.all(
                (fullThread.messages ?? [])
                  .slice(0, maxMessagesPerThread)
                  .map(async (message) =>
                    truncateMessageSummary(
                      await summarizeGmailMessageWithHtml(
                        gmail,
                        message,
                        resolveSenderPhotoUrl,
                      ),
                      1600,
                    ),
                  ),
              ),
              snippet: fullThread.snippet ?? thread.snippet,
            };
          }),
        );

        return {
          nextPageToken: list.nextPageToken,
          resultSizeEstimate: list.resultSizeEstimate,
          threads,
        };
      },
    }),
    getGmailMessage: tool({
      description:
        "Read a single Gmail message by id. Use this after search when one message needs closer inspection.",
      inputSchema: z.object({
        messageId: z.string().trim().min(1),
      }),
      execute: async ({ messageId }) => {
        const message = await gmail.getMessage(messageId, {
          format: "full",
        });

        return truncateMessageSummary(
          await summarizeGmailMessageWithHtml(
            gmail,
            message,
            resolveSenderPhotoUrl,
          ),
          6000,
        );
      },
    }),
    listGmailMessageAttachments: tool({
      description:
        "List downloadable MIME attachments and inline body attachments for a Gmail message.",
      inputSchema: z.object({
        messageId: z.string().trim().min(1),
      }),
      execute: async ({ messageId }) => {
        const message = await gmail.getMessage(messageId, {
          format: "full",
        });
        const summary = summarizeGmailMessage(message);

        return {
          attachments: summary.attachments ?? [],
          messageId: message.id,
          subject: summary.subject,
          threadId: message.threadId,
        };
      },
    }),
    getGmailMessageAttachment: tool({
      description:
        "Read a Gmail message attachment by message id and attachment id. For text-like attachments, decodedText is included.",
      inputSchema: z.object({
        attachmentId: z.string().trim().min(1),
        maxDataLength: z.number().int().min(0).max(50000).default(12000),
        messageId: z.string().trim().min(1),
        mimeType: z
          .string()
          .trim()
          .optional()
          .describe("Optional MIME type from listGmailMessageAttachments."),
      }),
      execute: async ({ attachmentId, maxDataLength, messageId, mimeType }) => {
        const attachment = await gmail.getMessageAttachment(
          messageId,
          attachmentId,
        );
        const dataBase64 = truncateText(attachment.data, maxDataLength);
        const decodedText =
          attachment.data && isTextLikeMimeType(mimeType)
            ? truncateText(decodeGmailBodyData(attachment.data), maxDataLength)
            : undefined;

        return {
          attachmentId,
          dataBase64,
          decodedText,
          isDataTruncated:
            Boolean(attachment.data) &&
            Boolean(dataBase64) &&
            (dataBase64?.length ?? 0) < attachment.data!.length,
          messageId,
          mimeType,
          size: attachment.size,
        };
      },
    }),
    getGmailThread: tool({
      description:
        "Read a Gmail thread by id and return message summaries in thread order.",
      inputSchema: z.object({
        maxMessages: z.number().int().min(1).max(20).default(10),
        threadId: z.string().trim().min(1),
      }),
      execute: async ({ threadId, maxMessages }) => {
        const thread = await gmail.getThread(threadId, {
          format: "full",
        });

        return {
          id: thread.id,
          messages: await Promise.all(
            (thread.messages ?? []).slice(0, maxMessages).map(async (message) =>
              truncateMessageSummary(
                await summarizeGmailMessageWithHtml(
                  gmail,
                  message,
                  resolveSenderPhotoUrl,
                ),
                3000,
              ),
            ),
          ),
        };
      },
    }),
    getGmailProfile: tool({
      description:
        "Read the connected Gmail profile and mailbox counts for the organization integration.",
      inputSchema: z.object({}),
      execute: async () => gmail.getProfile(),
    }),
    listGmailHistory: tool({
      description:
        "List recent Gmail mailbox history from a start history id. Use getGmailProfile first if a start history id is needed.",
      inputSchema: z.object({
        historyTypes: z
          .array(
            z.enum([
              "labelAdded",
              "labelRemoved",
              "messageAdded",
              "messageDeleted",
            ]),
          )
          .default([]),
        labelId: z.string().trim().optional(),
        maxResults: z.number().int().min(1).max(100).default(20),
        pageToken: z.string().trim().optional(),
        startHistoryId: z.string().trim().min(1),
      }),
      execute: async ({
        historyTypes,
        labelId,
        maxResults,
        pageToken,
        startHistoryId,
      }) =>
        gmail.listHistory({
          historyTypes,
          labelId,
          maxResults,
          pageToken,
          startHistoryId,
        }),
    }),
    getGmailRawMessage: tool({
      description:
        "Read the raw RFC 2822 Gmail message source as URL-safe base64 for debugging message headers or MIME structure.",
      inputSchema: z.object({
        maxRawLength: z.number().int().min(0).max(50000).default(12000),
        messageId: z.string().trim().min(1),
      }),
      execute: async ({ maxRawLength, messageId }) => {
        const message = await gmail.getMessage(messageId, {
          format: "raw",
        });
        const rawBase64 = truncateText(message.raw, maxRawLength);

        return {
          historyId: message.historyId,
          id: message.id,
          isRawTruncated:
            Boolean(message.raw) &&
            Boolean(rawBase64) &&
            (rawBase64?.length ?? 0) < message.raw!.length,
          rawBase64,
          sizeEstimate: message.sizeEstimate,
          threadId: message.threadId,
        };
      },
    }),
  };
}

async function summarizeGmailMessageWithHtml(
  gmail: GmailReadonlyClient,
  message: GmailMessage,
  resolveSenderPhotoUrl?: SenderPhotoResolver,
) {
  const summary = summarizeGmailMessage(message);
  const senderPhotoUrl = await resolveSenderPhotoUrl?.(summary.from);
  const summaryWithPhoto = senderPhotoUrl
    ? {
        ...summary,
        senderPhotoUrl,
      }
    : summary;

  if (summaryWithPhoto.bodyHtml) {
    return summaryWithPhoto;
  }

  const htmlAttachmentId = findHtmlAttachmentId(message.payload);

  if (!htmlAttachmentId) {
    return summaryWithPhoto;
  }

  const attachment = await gmail.getMessageAttachment(
    message.id,
    htmlAttachmentId,
  );

  return {
    ...summaryWithPhoto,
    bodyHtml: attachment.data
      ? decodeGmailBodyData(attachment.data)
      : summaryWithPhoto.bodyHtml,
  };
}

type SenderPhotoResolver = (from?: string) => Promise<string | undefined>;

function createSenderPhotoResolver(gmail: GmailReadonlyClient): SenderPhotoResolver {
  let contactsPromise: Promise<Map<string, string>> | undefined;
  const misses = new Set<string>();

  return async (from) => {
    const email = extractEmailAddress(from);

    if (!email || misses.has(email)) {
      return undefined;
    }

    try {
      const contacts =
        contactsPromise ?? (contactsPromise = loadContactPhotoMap(gmail));
      const photoUrl = (await contacts).get(email);

      if (!photoUrl) {
        misses.add(email);
      }

      return photoUrl;
    } catch {
      contactsPromise = Promise.resolve(new Map());
      return undefined;
    }
  };
}

async function loadContactPhotoMap(gmail: GmailReadonlyClient) {
  const photosByEmail = new Map<string, string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const response = await gmail.listContactProfiles({
      pageSize: 1000,
      pageToken,
    });

    for (const person of response.connections ?? []) {
      const photoUrl =
        person.photos?.find((photo) => photo.metadata?.primary)?.url ??
        person.photos?.find((photo) => photo.url)?.url;

      if (!photoUrl) {
        continue;
      }

      for (const email of person.emailAddresses ?? []) {
        const normalizedEmail = normalizeSenderEmail(email.value);

        if (normalizedEmail) {
          photosByEmail.set(normalizedEmail, photoUrl);
        }
      }
    }

    pageToken = response.nextPageToken;

    if (!pageToken) {
      break;
    }
  }

  return photosByEmail;
}

function extractEmailAddress(from?: string) {
  if (!from) {
    return undefined;
  }

  return normalizeSenderEmail(from.match(/<(.+?)>/)?.[1] ?? from);
}

function normalizeSenderEmail(value?: string) {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : undefined;
}

function findHtmlAttachmentId(part?: GmailMessagePart): string | undefined {
  if (!part) {
    return undefined;
  }

  if (part.mimeType === "text/html" && part.body?.attachmentId) {
    return part.body.attachmentId;
  }

  for (const child of part.parts ?? []) {
    const attachmentId = findHtmlAttachmentId(child);

    if (attachmentId) {
      return attachmentId;
    }
  }

  return undefined;
}

function truncateMessageSummary(
  summary: GmailMessageSummary,
  maxBodyLength = 2000,
) {
  return {
    ...summary,
    bodyHtml: truncateText(summary.bodyHtml, Math.max(maxBodyLength * 16, 50000)),
    bodyText: truncateText(summary.bodyText, maxBodyLength),
  };
}

function isTextLikeMimeType(mimeType?: string) {
  if (!mimeType) {
    return false;
  }

  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+xml")
  );
}
