import { Hocuspocus } from "@hocuspocus/server";
import type { MeetingTranscriptYjsSegment } from "@zilobase/runtime-adapter/capabilities";
import { getRuntimePorts, requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";
import * as Y from "yjs";
import type { RuntimeEnv } from "../../../shared/config/config";
import { assignBlockIds, planPageEdits, type PageEdit } from "@zilobase/page-context";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import {
  encodeContentAsYjs,
  encodePageContentAsYjs,
  FIELD_NAME,
  materializePageDocument,
  pageNodesAsYjsBlocks,
} from "../documents/document-codec";
import { documentNameForMeeting, documentNameForPage } from "../documents/documents";
import { COMMENT_THREADS_FIELD } from "../persistence/document-persistence";
import { CollaborationContext, getDefaultCollaborationHocuspocus } from "../runtime/hocuspocus";
import { TICKET_TTL_MS } from "../tickets/ticket-security";
export async function replacePageContent(input: {
  content: unknown;
  env: RuntimeEnv;
  pageId: string;
  userId: string;
}) {
  const fanout = requireRuntimePort("fanout");
  await fanout.publish(`page:${input.pageId}:replace`, {
    content: input.content,
    pageId: input.pageId,
    userId: input.userId,
  });
}

export type PageContentEditInput = {
  pageId: string;
  userId: string;
  edits: PageEdit[];
  /** Applied edit IDs are kept in the document, so a redelivered edit is a no-op. */
  editId: string;
};
export type PageContentEditResult =
  | { status: "applied" | "replayed"; blocks: number }
  | { status: "rejected"; error: string };

export async function editPageContent(input: PageContentEditInput) {
  const result = await requireRuntimePort("documents").editPageContent(input);
  if (result.status === "rejected") throw new ServiceMutationError(result.error, 409);
  return result;
}

/** The live page content, including edits not yet saved to the page record. */
export async function readLivePageContent(input: { pageId: string; userId: string }) {
  return requireRuntimePort("documents").readPageContent(input);
}

export async function appendPageComment(input: {
  author: { email: string | null; id: string; image: string | null; name: string | null };
  body: string;
  env: RuntimeEnv;
  pageId: string;
  /** Caller-reserved IDs make a redelivered comment a no-op. */
  threadId?: string;
  messageId?: string;
}) {
  const { env: _env, ...comment } = input;
  // Worker documents are Durable Object RPCs; the runtime env cannot be serialized.
  return requireRuntimePort("documents").appendPageComment(comment);
}

export async function replaceMeetingSummary(input: {
  content: unknown;
  env: RuntimeEnv;
  meetingId: string;
  userId: string;
}) {
  const meetings = getRuntimePorts().meetings;
  if (meetings) {
    await meetings.applySummary(input);
    return;
  }
  await replaceMeetingSummaryInHocuspocus(getDefaultCollaborationHocuspocus(input.env), input);
}

export async function appendMeetingTranscript(input: {
  draftItemId?: string;
  env: RuntimeEnv;
  meetingId: string;
  segment: MeetingTranscriptYjsSegment;
  userId: string;
}) {
  const meetings = getRuntimePorts().meetings;
  if (meetings) {
    await meetings.applyTranscript(input);
    return;
  }
  await appendMeetingTranscriptInHocuspocus(getDefaultCollaborationHocuspocus(input.env), input);
}

export function appendMeetingTranscriptToDocument(
  document: Y.Doc,
  segment: MeetingTranscriptYjsSegment,
  draftItemId?: string,
) {
  const segmentIds = document.getMap<boolean>("transcriptSegmentIds");
  let appended = false;

  document.transact(() => {
    if (!segmentIds.has(segment.id)) {
      const paragraph = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      const speaker = meetingTranscriptSpeakerLabel(segment.source);
      text.insert(
        0,
        `[${formatMeetingTimestamp(segment.startMs)}] ${speaker ? `${speaker}: ` : ""}${segment.text}`,
      );
      paragraph.insert(0, [text]);
      const transcript = document.getXmlFragment("transcript");
      const timestampSeconds = Math.max(0, Math.floor(segment.startMs / 1_000));
      const insertionIndex = transcript.toArray().findIndex((node) => {
        const existingTimestamp = transcriptTimestampSeconds(node.toString());
        return existingTimestamp !== null && existingTimestamp > timestampSeconds;
      });
      transcript.insert(insertionIndex === -1 ? transcript.length : insertionIndex, [paragraph]);
      segmentIds.set(segment.id, true);
      appended = true;
    }
    if (draftItemId) {
      const draft = document.getMap<string | number>(`liveTranscript:${segment.source}`);
      if (draft.get("itemId") === draftItemId) draft.clear();
    }
  }, "meeting-transcription");
  return appended;
}

export async function appendMeetingTranscriptInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: {
    draftItemId?: string;
    meetingId: string;
    segment: MeetingTranscriptYjsSegment;
    userId: string;
  },
) {
  const direct = await hocuspocus.openDirectConnection(documentNameForMeeting(input.meetingId), {
    exp: Date.now() + TICKET_TTL_MS,
    meetingId: input.meetingId,
    scope: "read-write",
    userId: input.userId,
    workspaceId: "server",
  });
  try {
    await direct.transact((document) => {
      appendMeetingTranscriptToDocument(document, input.segment, input.draftItemId);
    });
  } finally {
    await direct.disconnect();
  }
}

export async function replaceMeetingSummaryInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: { content: unknown; meetingId: string; userId: string },
) {
  const direct = await hocuspocus.openDirectConnection(documentNameForMeeting(input.meetingId), {
    exp: Date.now() + TICKET_TTL_MS,
    meetingId: input.meetingId,
    scope: "read-write",
    userId: input.userId,
    workspaceId: "server",
  });
  const update = encodeContentAsYjs(input.content, "summary");
  try {
    await direct.transact((document) => {
      const fragment = document.getXmlFragment("summary");
      fragment.delete(0, fragment.length);
      Y.applyUpdate(document, update);
    });
  } finally {
    await direct.disconnect();
  }
}

export async function replacePageContentInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: {
    content: unknown;
    pageId: string;
    userId: string;
  },
) {
  const direct = await hocuspocus.openDirectConnection(documentNameForPage(input.pageId), {
    exp: Date.now() + TICKET_TTL_MS,
    pageId: input.pageId,
    scope: "read-write",
    userId: input.userId,
    workspaceId: "server",
  });
  const update = encodePageContentAsYjs(input.content);

  try {
    await direct.transact((document) => {
      const fragment = document.getXmlFragment(FIELD_NAME);
      fragment.delete(0, fragment.length);
      Y.applyUpdate(document, update);
    });
  } finally {
    await direct.disconnect();
  }
}

export async function appendPageCommentInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: {
    author: { email: string | null; id: string; image: string | null; name: string | null };
    body: string;
    pageId: string;
    threadId?: string;
    messageId?: string;
  },
) {
  const direct = await hocuspocus.openDirectConnection(documentNameForPage(input.pageId), {
    exp: Date.now() + TICKET_TTL_MS,
    pageId: input.pageId,
    scope: "read-write",
    userId: input.author.id,
    workspaceId: "server",
  });
  const threadId = input.threadId ?? crypto.randomUUID();
  const messageId = input.messageId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await direct.transact((document) => {
      const threads = document.getMap<Y.Map<unknown>>(COMMENT_THREADS_FIELD);
      if (threads.has(threadId)) return;
      const thread = new Y.Map<unknown>();
      const messages = new Y.Map<Y.Map<unknown>>();
      const message = new Y.Map<unknown>();
      message.set("id", messageId);
      message.set("author", input.author);
      message.set("body", input.body);
      message.set("createdAt", now);
      message.set("editedAt", null);
      message.set("reactions", new Y.Map());
      messages.set(messageId, message);
      thread.set("id", threadId);
      thread.set("kind", "page");
      thread.set("quote", null);
      thread.set("rootMessageId", messageId);
      thread.set("createdBy", input.author);
      thread.set("createdAt", now);
      thread.set("updatedAt", now);
      thread.set("resolvedAt", null);
      thread.set("resolvedBy", null);
      thread.set("messages", messages);
      threads.set(threadId, thread);
    });
  } finally {
    await direct.disconnect();
  }
  return { messageId, threadId };
}

export function formatMeetingTimestamp(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function meetingTranscriptSpeakerLabel(source: MeetingTranscriptYjsSegment["source"]) {
  if (source === "microphone") return "You";
  if (source === "system") return "Others";
  return null;
}

export function transcriptTimestampSeconds(serializedNode: string) {
  const match = serializedNode.match(/>\[(\d+):([0-5]\d)\]\s/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const APPLIED_EDITS_FIELD = "zilobase:applied-edits";
const APPLIED_EDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Applies planned block splices to the live page in one transaction. Edits
 * resolve against the live document, not the saved snapshot, and only the
 * spliced top-level blocks change, so comments and concurrent edits in other
 * blocks are kept.
 */
export async function editPageContentInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: PageContentEditInput,
): Promise<PageContentEditResult> {
  const direct = await hocuspocus.openDirectConnection(documentNameForPage(input.pageId), {
    exp: Date.now() + TICKET_TTL_MS,
    pageId: input.pageId,
    scope: "read-write",
    userId: input.userId,
    workspaceId: "server",
  });
  let result: PageContentEditResult = {
    status: "rejected",
    error: "The page could not be edited.",
  };
  try {
    await direct.transact((document) => {
      const applied = document.getMap<number>(APPLIED_EDITS_FIELD);
      const fragment = document.getXmlFragment(FIELD_NAME);
      if (applied.has(input.editId)) {
        result = { status: "replayed", blocks: fragment.length };
        return;
      }
      const current = materializePageDocument(document) as { content?: unknown[] };
      if ((current.content?.length ?? 0) !== fragment.length) {
        result = { status: "rejected", error: "The page has content that cannot be edited yet." };
        return;
      }
      const plan = planPageEdits(current as never, input.edits);
      if ("error" in plan) {
        result = { status: "rejected", error: plan.error };
        return;
      }
      for (const splice of plan.splices) {
        if (splice.deleteCount) fragment.delete(splice.index, splice.deleteCount);
        if (splice.nodes.length)
          fragment.insert(
            splice.index,
            pageNodesAsYjsBlocks(assignBlockIds(splice.nodes, () => crypto.randomUUID())),
          );
      }
      const now = Date.now();
      for (const [id, at] of applied.entries())
        if (now - at > APPLIED_EDIT_RETENTION_MS) applied.delete(id);
      applied.set(input.editId, now);
      result = { status: "applied", blocks: fragment.length };
    });
  } finally {
    await direct.disconnect();
  }
  return result;
}

export async function readPageContentInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: { pageId: string; userId: string },
) {
  const direct = await hocuspocus.openDirectConnection(documentNameForPage(input.pageId), {
    exp: Date.now() + TICKET_TTL_MS,
    pageId: input.pageId,
    scope: "readonly",
    userId: input.userId,
    workspaceId: "server",
  });
  try {
    return direct.document ? materializePageDocument(direct.document) : null;
  } finally {
    await direct.disconnect();
  }
}
