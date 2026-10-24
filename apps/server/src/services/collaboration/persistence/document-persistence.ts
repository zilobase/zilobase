import type { ContentEdit } from "../documents/content-editor";
import { nudgeSearchIndexing } from "../../search/invalidation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import * as Y from "yjs";
import { db, runWithDbEnv } from "../../../infrastructure/database/index";
import {
  meeting,
  meetingCollaborationDocument,
  meetingTranscriptSegment,
  page,
  pageCollaborationDocument,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { encodePageContentAsYjs, materializePageDocument } from "../documents/document-codec";
import {
  isEmptyPageContent,
  isPlaceholderCollaborationState,
  meetingIdFromDocumentName,
  pageIdFromDocumentName,
} from "../documents/documents";
import { appendMeetingTranscriptToDocument } from "../mutations/document-mutations";
export const COMMENT_THREADS_FIELD = "commentThreads";

export async function getOrCreateCollaborationDocumentState(pageId: string) {
  const [stored] = await db
    .select({ state: pageCollaborationDocument.state })
    .from(pageCollaborationDocument)
    .where(eq(pageCollaborationDocument.pageId, pageId))
    .limit(1);
  const [record] = await db
    .select({ content: page.content })
    .from(page)
    .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!record) {
    throw new Error("Page not found");
  }

  const seededState = encodePageContentAsYjs(record.content);

  if (stored) {
    const storedState = new Uint8Array(stored.state);

    if (isPlaceholderCollaborationState(storedState) && !isEmptyPageContent(record.content)) {
      const now = new Date();
      await db
        .update(pageCollaborationDocument)
        .set({ state: Buffer.from(seededState), updatedAt: now })
        .where(eq(pageCollaborationDocument.pageId, pageId));
      return seededState;
    }

    return storedState;
  }

  const [inserted] = await db
    .insert(pageCollaborationDocument)
    .values({
      pageId,
      state: Buffer.from(seededState),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ state: pageCollaborationDocument.state });

  if (inserted) {
    return new Uint8Array(inserted.state);
  }

  // Another request initialized the document concurrently. Its state is the
  // canonical base every collaborator must use.
  const [concurrent] = await db
    .select({ state: pageCollaborationDocument.state })
    .from(pageCollaborationDocument)
    .where(eq(pageCollaborationDocument.pageId, pageId))
    .limit(1);

  if (!concurrent) {
    throw new Error("Could not initialize collaboration document");
  }

  return new Uint8Array(concurrent.state);
}

export async function getOrCreateMeetingCollaborationDocumentState(meetingId: string) {
  const [record] = await db
    .select({
      transcriptRevision: meeting.transcriptRevision,
    })
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), isNull(meeting.deletedAt)))
    .limit(1);

  if (!record) {
    throw new Error("Meeting not found");
  }

  const [stored] = await db
    .select({ state: meetingCollaborationDocument.state })
    .from(meetingCollaborationDocument)
    .where(eq(meetingCollaborationDocument.meetingId, meetingId))
    .limit(1);

  const document = new Y.Doc();
  if (stored) Y.applyUpdate(document, new Uint8Array(stored.state));

  document.getXmlFragment("notes");
  document.getXmlFragment("summary");
  document.getXmlFragment("transcript");
  let changed = false;
  const segments = await db
    .select({
      id: meetingTranscriptSegment.id,
      source: meetingTranscriptSegment.source,
      startMs: meetingTranscriptSegment.startMs,
      text: meetingTranscriptSegment.text,
    })
    .from(meetingTranscriptSegment)
    .where(
      and(
        eq(meetingTranscriptSegment.meetingId, meetingId),
        eq(meetingTranscriptSegment.revision, record.transcriptRevision),
      ),
    )
    .orderBy(asc(meetingTranscriptSegment.sequence));
  document.transact(() => {
    for (const segment of segments) {
      changed =
        appendMeetingTranscriptToDocument(document, {
          ...segment,
        }) || changed;
    }
  }, "meeting-transcript-reconciliation");

  const initialState = Y.encodeStateAsUpdate(document);
  if (stored) {
    if (changed) {
      await db
        .update(meetingCollaborationDocument)
        .set({ state: Buffer.from(initialState), updatedAt: new Date() })
        .where(eq(meetingCollaborationDocument.meetingId, meetingId));
    }
    return initialState;
  }
  const [inserted] = await db
    .insert(meetingCollaborationDocument)
    .values({ meetingId, state: Buffer.from(initialState), updatedAt: new Date() })
    .onConflictDoNothing()
    .returning({ state: meetingCollaborationDocument.state });

  if (inserted) return new Uint8Array(inserted.state);

  const [concurrent] = await db
    .select({ state: meetingCollaborationDocument.state })
    .from(meetingCollaborationDocument)
    .where(eq(meetingCollaborationDocument.meetingId, meetingId))
    .limit(1);

  if (!concurrent) {
    throw new Error("Could not initialize meeting collaboration document");
  }

  return new Uint8Array(concurrent.state);
}

export type CollaborationDocumentPersistence = {
  load(documentName: string): Promise<Uint8Array>;
  store(input: {
    document: Y.Doc;
    documentName: string;
    state: Uint8Array;
    contentEdit?: ContentEdit;
  }): Promise<void>;
};

export async function loadDocument(documentName: string, env: RuntimeEnv) {
  const pageId = pageIdFromDocumentName(documentName);
  const meetingId = meetingIdFromDocumentName(documentName);

  if (!pageId && !meetingId) {
    throw new Error("Invalid collaboration document name");
  }

  const loadStartedAt = performance.now();

  try {
    return await withDatabase(env, () =>
      pageId
        ? getOrCreateCollaborationDocumentState(pageId)
        : getOrCreateMeetingCollaborationDocumentState(meetingId!),
    );
  } finally {
    console.info(
      JSON.stringify({
        event: "collaboration_document_loaded",
        loadMs: Math.round(performance.now() - loadStartedAt),
      }),
    );
  }
}

export async function storeDocument(
  documentName: string,
  document: Y.Doc,
  state: Uint8Array,
  env: RuntimeEnv,
  contentEdit?: ContentEdit,
) {
  const pageId = pageIdFromDocumentName(documentName);
  const meetingId = meetingIdFromDocumentName(documentName);

  if (!pageId && !meetingId) {
    throw new Error("Invalid collaboration document name");
  }

  const now = new Date();

  if (meetingId) {
    await withDatabase(env, () =>
      db
        .insert(meetingCollaborationDocument)
        .values({ meetingId, state: Buffer.from(state), updatedAt: now })
        .onConflictDoUpdate({
          target: meetingCollaborationDocument.meetingId,
          set: { state: Buffer.from(state), updatedAt: now },
        }),
    );
    return;
  }

  if (!pageId) {
    throw new Error("Invalid page collaboration document name");
  }

  const content = materializePageDocument(document);

  await withDatabase(env, async () => {
    await db.transaction(async (tx) => {
      if (contentEdit)
        await tx.execute(
          sql`select set_config('zilobase.content_actor', ${contentEdit.userId ?? ""}, true), set_config('zilobase.content_edit_at', ${contentEdit.occurredAt.toISOString()}, true)`,
        );
      const [existing] = await tx
        .select({ content: page.content })
        .from(page)
        .where(eq(page.id, pageId))
        .limit(1);
      const nextContent =
        isEmptyPageContent(content) && !isEmptyPageContent(existing?.content)
          ? existing?.content
          : content;

      await tx
        .insert(pageCollaborationDocument)
        .values({ pageId, state: Buffer.from(state), updatedAt: now })
        .onConflictDoUpdate({
          target: pageCollaborationDocument.pageId,
          set: { state: Buffer.from(state), updatedAt: now },
        });
      await tx
        .update(page)
        .set({
          content: nextContent,
          hasContent: !isEmptyPageContent(content),
          updatedAt: now,
        })
        .where(eq(page.id, pageId));
    });
    await nudgeSearchIndexing(env);
  });
}

export async function getMeetingPageId(meetingId: string) {
  const [record] = await db
    .select({ pageId: meeting.pageId })
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), isNull(meeting.deletedAt)))
    .limit(1);
  return record?.pageId ?? null;
}

export function withDatabase<T>(env: RuntimeEnv, callback: () => Promise<T>) {
  return runWithDbEnv(env, callback);
}
