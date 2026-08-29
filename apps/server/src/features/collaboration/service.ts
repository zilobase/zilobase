import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus, type Extension } from "@hocuspocus/server";
import { ProsemirrorTransformer } from "@hocuspocus/transformer";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Schema, type MarkSpec, type NodeSpec } from "@tiptap/pm/model";
import * as Y from "yjs";
import { isPageBodyEmpty } from "@zilobase/features/pages/content-state";
import { canAccessPageInWorkspace } from "../access";
import { db, runWithDbEnv } from "../../infrastructure/database";
import {
  meeting,
  meetingCollaborationDocument,
  meetingTranscriptSegment,
  page,
  pageCollaborationDocument,
} from "../../infrastructure/database/schema";
import { getRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";
import type { MeetingTranscriptYjsSegment } from "../../infrastructure/runtime/runtime-adapter";
import type { RuntimeEnv } from "../../shared/config/config";

const DOCUMENT_PREFIX = "page:";
const MEETING_DOCUMENT_PREFIX = "meeting:";
const FIELD_NAME = "default";
const COMMENT_THREADS_FIELD = "commentThreads";
const TICKET_TTL_MS = 5 * 60 * 1000;

export type PageCollaborationTicketClaims = {
  exp: number;
  pageId: string;
  scope: "comment" | "read-write" | "readonly";
  userId: string;
  workspaceId: string;
};

export type MeetingCollaborationTicketClaims = {
  exp: number;
  meetingId: string;
  scope: "read-write" | "readonly";
  userId: string;
  workspaceId: string;
};

export type CollaborationTicketClaims =
  | PageCollaborationTicketClaims
  | MeetingCollaborationTicketClaims;
export type CollaborationContext = CollaborationTicketClaims;

export function documentNameForPage(pageId: string) {
  return `${DOCUMENT_PREFIX}${pageId}`;
}

export function pageIdFromDocumentName(documentName: string) {
  return documentName.startsWith(DOCUMENT_PREFIX)
    ? documentName.slice(DOCUMENT_PREFIX.length)
    : null;
}

export function documentNameForMeeting(meetingId: string) {
  return `${MEETING_DOCUMENT_PREFIX}${meetingId}`;
}

export function meetingIdFromDocumentName(documentName: string) {
  return documentName.startsWith(MEETING_DOCUMENT_PREFIX)
    ? documentName.slice(MEETING_DOCUMENT_PREFIX.length)
    : null;
}

export async function createCollaborationTicket(
  claims:
    | Omit<PageCollaborationTicketClaims, "exp">
    | Omit<MeetingCollaborationTicketClaims, "exp">,
  env: RuntimeEnv,
  options: { maxExpiresAt?: Date | null } = {},
) {
  const defaultExpiration = Date.now() + TICKET_TTL_MS;
  const payload: CollaborationTicketClaims = {
    ...claims,
    exp: options.maxExpiresAt
      ? Math.min(defaultExpiration, options.maxExpiresAt.getTime())
      : defaultExpiration,
  };

  if (payload.exp <= Date.now()) {
    throw new Error("Collaboration access has expired");
  }
  const encoded = encodeJson(payload);
  const signature = await sign(encoded, getTicketSecret(env));

  return {
    expiresAt: new Date(payload.exp).toISOString(),
    token: `${encoded}.${signature}`,
  };
}

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

    if (
      isPlaceholderCollaborationState(storedState) &&
      !isEmptyPageContent(record.content)
    ) {
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

export async function getOrCreateMeetingCollaborationDocumentState(
  meetingId: string,
) {
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
      changed = appendMeetingTranscriptToDocument(document, {
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

export async function verifyCollaborationTicket(
  token: string,
  env: RuntimeEnv,
): Promise<CollaborationTicketClaims> {
  const [encoded, signature, extra] = token.split(".");

  if (!encoded || !signature || extra) {
    throw new Error("Invalid collaboration ticket");
  }

  const expected = await sign(encoded, getTicketSecret(env));

  if (!constantTimeEqual(signature, expected)) {
    throw new Error("Invalid collaboration ticket");
  }

  const claims = decodeJson(encoded);

  if (!isTicketClaims(claims) || claims.exp <= Date.now()) {
    throw new Error("Expired collaboration ticket");
  }

  return claims;
}

export type CollaborationDocumentPersistence = {
  load(documentName: string): Promise<Uint8Array>;
  store(input: {
    document: Y.Doc;
    documentName: string;
    state: Uint8Array;
  }): Promise<void>;
};

export function createCollaborationHocuspocus(
  env: RuntimeEnv,
  persistence?: CollaborationDocumentPersistence,
) {
  const documentLoads = new Map<string, Promise<Uint8Array>>();

  const preloadDocument = (documentName: string) => {
    const existing = documentLoads.get(documentName);

    if (existing) {
      return existing;
    }

    const load = persistence
      ? persistence.load(documentName)
      : loadDocument(documentName, env);
    documentLoads.set(documentName, load);
    void load.catch(() => documentLoads.delete(documentName));
    return load;
  };

  const consumeDocument = (documentName: string) => {
    const load =
      documentLoads.get(documentName) ?? preloadDocument(documentName);
    documentLoads.delete(documentName);
    return load;
  };

  return new Hocuspocus<CollaborationContext>({
    debounce: 800,
    maxDebounce: 5_000,
    extensions: [
      ...(collaborationExtensionsFactory?.(env) ?? []),
      new Database({
        fetch: async ({ documentName }) => consumeDocument(documentName),
        store: async ({ documentName, document, state }) =>
          persistence
            ? persistence.store({ document, documentName, state })
            : storeDocument(documentName, document, state, env),
      }),
    ],
    async onAuthenticate({ connectionConfig, documentName, requestParameters, token }) {
      const authenticateStartedAt = performance.now();
      const claims = await verifyCollaborationTicket(token, env);
      const ticketVerifyMs = Math.round(
        performance.now() - authenticateStartedAt,
      );
      const pageId = pageIdFromDocumentName(documentName);
      const meetingId = meetingIdFromDocumentName(documentName);
      const routedDocumentName = requestParameters.get("document");

      const ticketMatches = pageId
        ? "pageId" in claims && pageId === claims.pageId
        : meetingId
          ? "meetingId" in claims && meetingId === claims.meetingId
          : false;

      if (!ticketMatches) {
        throw new Error("Collaboration ticket does not match the document");
      }

      if (routedDocumentName && routedDocumentName !== documentName) {
        throw new Error(
          "Collaboration document does not match the routed room",
        );
      }

      // Hocuspocus loads the document after authentication. Start the read once
      // the signed ticket has scoped the request so it overlaps the live access
      // check instead of adding another database round trip to first sync.
      const documentLoad = preloadDocument(documentName);
      const pageAccessStartedAt = performance.now();
      const allowed = await withDatabase(env, async () => {
        const accessPageId = pageId ?? await getMeetingPageId(meetingId!);
        return accessPageId
          ? canAccessPageInWorkspace(
              accessPageId,
              claims.workspaceId,
              claims.userId,
              claims.scope === "readonly"
                ? "view"
                : claims.scope === "comment"
                  ? "comment"
                  : "edit",
            )
          : false;
      });
      const pageAccessMs = Math.round(performance.now() - pageAccessStartedAt);

      console.info(
        JSON.stringify({
          event: "collaboration_ticket_authenticated",
          pageAccessMs,
          ticketVerifyMs,
        }),
      );

      if (!allowed) {
        documentLoads.delete(documentName);
        throw new Error("Forbidden");
      }

      connectionConfig.readOnly = claims.scope === "readonly";

      // Retain the promise until Hocuspocus asks its Database extension for it.
      // Its rejection will be surfaced by that fetch path for authorized clients.
      void documentLoad.catch(() => undefined);

      return claims;
    },
    async beforeSync({ context, document, payload, type }) {
      if (context.scope === "comment" && (type === 1 || type === 2)) {
        assertCommentOnlyCollaborationUpdate(document, payload);
      }
    },
    async connected({ connection, context }) {
      const timeout = setTimeout(
        () => connection.close(),
        Math.max(0, context.exp - Date.now()),
      );
      connection.onClose(() => clearTimeout(timeout));
    },
  });
}

let collaborationExtensionsFactory:
  | ((env: RuntimeEnv) => Extension[])
  | null = null;

export function setCollaborationExtensionsFactory(
  factory: ((env: RuntimeEnv) => Extension[]) | null,
) {
  collaborationExtensionsFactory = factory;
}

let defaultHocuspocus: Hocuspocus<CollaborationContext> | null = null;

export function getDefaultCollaborationHocuspocus(env: RuntimeEnv) {
  defaultHocuspocus ??= createCollaborationHocuspocus(env);
  return defaultHocuspocus;
}

export function encodePageContentAsYjs(content: unknown) {
  return Y.encodeStateAsUpdate(toYDoc(content));
}

export function materializePageContentFromYjs(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return compactMaterializedJson(
    ProsemirrorTransformer.fromYdoc(document, FIELD_NAME),
  );
}

export async function replacePageContent(input: {
  content: unknown;
  env: RuntimeEnv;
  pageId: string;
  userId: string;
}) {
  const adapter = getRuntimeAdapter();

  if (adapter.applyPageContentUpdate) {
    await adapter.applyPageContentUpdate(input);
    return;
  }

  const hocuspocus = getDefaultCollaborationHocuspocus(input.env);
  await replacePageContentInHocuspocus(hocuspocus, input);
}

export async function replaceMeetingSummary(input: {
  content: unknown;
  env: RuntimeEnv;
  meetingId: string;
  userId: string;
}) {
  const adapter = getRuntimeAdapter();
  if (adapter.applyMeetingSummaryUpdate) {
    await adapter.applyMeetingSummaryUpdate(input);
    return;
  }
  await replaceMeetingSummaryInHocuspocus(
    getDefaultCollaborationHocuspocus(input.env),
    input,
  );
}

export async function appendMeetingTranscript(input: {
  draftItemId?: string;
  env: RuntimeEnv;
  meetingId: string;
  segment: MeetingTranscriptYjsSegment;
  userId: string;
}) {
  const adapter = getRuntimeAdapter();
  if (adapter.applyMeetingTranscriptUpdate) {
    await adapter.applyMeetingTranscriptUpdate(input);
    return;
  }
  await appendMeetingTranscriptInHocuspocus(
    getDefaultCollaborationHocuspocus(input.env),
    input,
  );
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
      const insertionIndex = transcript
        .toArray()
        .findIndex((node) => {
          const existingTimestamp = transcriptTimestampSeconds(node.toString());
          return existingTimestamp !== null && existingTimestamp > timestampSeconds;
        });
      transcript.insert(
        insertionIndex === -1 ? transcript.length : insertionIndex,
        [paragraph],
      );
      segmentIds.set(segment.id, true);
      appended = true;
    }
    if (draftItemId) {
      const draft = document.getMap<string | number>(
        `liveTranscript:${segment.source}`,
      );
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
  const direct = await hocuspocus.openDirectConnection(
    documentNameForMeeting(input.meetingId),
    {
      exp: Date.now() + TICKET_TTL_MS,
      meetingId: input.meetingId,
      scope: "read-write",
      userId: input.userId,
      workspaceId: "server",
    },
  );
  try {
    await direct.transact((document) => {
      appendMeetingTranscriptToDocument(
        document,
        input.segment,
        input.draftItemId,
      );
    });
  } finally {
    await direct.disconnect();
  }
}

export async function replaceMeetingSummaryInHocuspocus(
  hocuspocus: Hocuspocus<CollaborationContext>,
  input: { content: unknown; meetingId: string; userId: string },
) {
  const direct = await hocuspocus.openDirectConnection(
    documentNameForMeeting(input.meetingId),
    {
      exp: Date.now() + TICKET_TTL_MS,
      meetingId: input.meetingId,
      scope: "read-write",
      userId: input.userId,
      workspaceId: "server",
    },
  );
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
  const direct = await hocuspocus.openDirectConnection(
    documentNameForPage(input.pageId),
    {
      exp: Date.now() + TICKET_TTL_MS,
      pageId: input.pageId,
      scope: "read-write",
      userId: input.userId,
      workspaceId: "server",
    },
  );
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

async function loadDocument(documentName: string, env: RuntimeEnv) {
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

async function storeDocument(
  documentName: string,
  document: Y.Doc,
  state: Uint8Array,
  env: RuntimeEnv,
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

  const content = compactMaterializedJson(
    ProsemirrorTransformer.fromYdoc(document, FIELD_NAME),
  );

  await withDatabase(env, () =>
    db.transaction(async (tx) => {
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
    }),
  );
}

async function getMeetingPageId(meetingId: string) {
  const [record] = await db
    .select({ pageId: meeting.pageId })
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), isNull(meeting.deletedAt)))
    .limit(1);
  return record?.pageId ?? null;
}

function toYDoc(content: unknown) {
  const normalized = normalizeDocument(content);
  return ProsemirrorTransformer.toYdoc(normalized, FIELD_NAME, createSchemaForDocument(normalized));
}

function encodeContentAsYjs(content: unknown, field: string) {
  const normalized = normalizeDocument(content);
  return Y.encodeStateAsUpdate(
    ProsemirrorTransformer.toYdoc(
      normalized,
      field,
      createSchemaForDocument(normalized),
    ),
  );
}

function formatMeetingTimestamp(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function meetingTranscriptSpeakerLabel(
  source: MeetingTranscriptYjsSegment["source"],
) {
  if (source === "microphone") return "You";
  if (source === "system") return "Others";
  return null;
}

function transcriptTimestampSeconds(serializedNode: string) {
  const match = serializedNode.match(/>\[(\d+):([0-5]\d)\]\s/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isEmptyPageContent(content: unknown): boolean {
  return isPageBodyEmpty(content);
}

export function isPlaceholderCollaborationState(state: Uint8Array): boolean {
  if (state.length === 0) {
    return true;
  }

  if (state.length === 2 && state[0] === 0 && state[1] === 0) {
    return true;
  }

  try {
    return isEmptyPageContent(materializePageContentFromYjs(state));
  } catch {
    return true;
  }
}

function normalizeDocument(content: unknown): ProseMirrorJson {
  return content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    typeof (content as { type?: unknown }).type === "string"
    ? (content as ProseMirrorJson)
    : { type: "doc", content: [] };
}

type ProseMirrorJson = {
  attrs?: Record<string, unknown>;
  content?: ProseMirrorJson[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type: string;
};

function createSchemaForDocument(document: ProseMirrorJson) {
  const nodeAttrs = new Map<string, Set<string>>();
  const markAttrs = new Map<string, Set<string>>();

  visit(document, (node) => {
    const attrs = nodeAttrs.get(node.type) ?? new Set<string>();
    Object.keys(node.attrs ?? {}).forEach((key) => attrs.add(key));
    nodeAttrs.set(node.type, attrs);
    for (const mark of node.marks ?? []) {
      const current = markAttrs.get(mark.type) ?? new Set<string>();
      Object.keys(mark.attrs ?? {}).forEach((key) => current.add(key));
      markAttrs.set(mark.type, current);
    }
  });

  nodeAttrs.set("doc", nodeAttrs.get("doc") ?? new Set());
  nodeAttrs.set("paragraph", nodeAttrs.get("paragraph") ?? new Set());
  nodeAttrs.set("text", new Set());

  const nodes: Record<string, NodeSpec> = {};
  for (const [name, attrs] of nodeAttrs) {
    nodes[name] = nodeSpec(name, attrs);
  }
  const marks: Record<string, MarkSpec> = {};
  for (const [name, attrs] of markAttrs) {
    marks[name] = { attrs: attrsSpec(attrs) };
  }
  return new Schema({ nodes, marks });
}

function nodeSpec(name: string, attrs: Set<string>): NodeSpec {
  if (name === "doc") return { content: "block*" };
  if (name === "text") return { group: "inline" };
  if (["paragraph", "heading", "codeBlock", "detailsSummary"].includes(name)) {
    return { attrs: attrsSpec(attrs), content: "inline*", group: "block" };
  }
  if (["bulletList", "orderedList", "taskList"].includes(name)) {
    return { attrs: attrsSpec(attrs), content: "block*", group: "block" };
  }
  if (
    [
      "listItem",
      "taskItem",
      "blockquote",
      "details",
      "detailsContent",
      "column",
      "columns",
      "tableCell",
      "tableHeader",
    ].includes(name)
  ) {
    return { attrs: attrsSpec(attrs), content: "block*", group: "block" };
  }
  if (name === "table") {
    return { attrs: attrsSpec(attrs), content: "tableRow+", group: "block" };
  }
  if (name === "tableRow") {
    return { attrs: attrsSpec(attrs), content: "(tableCell | tableHeader)+" };
  }
  if (["hardBreak", "emoji", "linkMention"].includes(name)) {
    return {
      attrs: attrsSpec(attrs),
      group: "inline",
      inline: true,
      atom: true,
    };
  }
  return { attrs: attrsSpec(attrs), group: "block", atom: true };
}

function attrsSpec(attrs: Set<string>) {
  return Object.fromEntries(
    [...attrs].map((name) => [name, { default: null }]),
  );
}

function visit(
  node: ProseMirrorJson,
  callback: (node: ProseMirrorJson) => void,
) {
  callback(node);
  node.content?.forEach((child) => visit(child, callback));
}

function compactMaterializedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactMaterializedJson);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const compacted = Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (
        key === "attrs" &&
        child &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        Object.keys(child).length === 0
      ) {
        return [];
      }

      return [[key, compactMaterializedJson(child)]];
    }),
  );

  return compacted;
}

function getTicketSecret(env: RuntimeEnv) {
  const value = env.COLLABORATION_SECRET ?? env.BETTER_AUTH_SECRET;
  if (typeof value !== "string" || !value) {
    throw new Error("COLLABORATION_SECRET or BETTER_AUTH_SECRET is required");
  }
  return value;
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Buffer.from(signature).toString("base64url");
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.subtle !== undefined
    ? timingSafeBytes(leftBytes, rightBytes)
    : false;
}

function timingSafeBytes(left: Buffer, right: Buffer) {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

function isTicketClaims(value: unknown): value is CollaborationTicketClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.exp === "number" &&
    ((typeof claims.pageId === "string" && claims.meetingId === undefined) ||
      (typeof claims.meetingId === "string" && claims.pageId === undefined)) &&
    (claims.scope === "comment" ||
      claims.scope === "read-write" ||
      claims.scope === "readonly") &&
    typeof claims.userId === "string" &&
    typeof claims.workspaceId === "string"
  );
}

export function assertCommentOnlyCollaborationUpdate(
  document: Y.Doc,
  update: Uint8Array,
) {
  const before = serializeProtectedCollaborationFields(document);
  const candidate = new Y.Doc();

  try {
    // Establish the concrete shared-type constructors before replaying updates.
    // Yjs otherwise materializes unknown fields as a generic AbstractType whose
    // JSON representation cannot be used for a permission comparison.
    candidate.getXmlFragment(FIELD_NAME);
    candidate.getMap(COMMENT_THREADS_FIELD);
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
    Y.applyUpdate(candidate, update);

    if (serializeProtectedCollaborationFields(candidate) !== before) {
      throw new Error("Comment access cannot modify page content");
    }
  } finally {
    candidate.destroy();
  }
}

function serializeProtectedCollaborationFields(document: Y.Doc) {
  return JSON.stringify(
    [...document.share.entries()]
      .filter(([field]) => field !== COMMENT_THREADS_FIELD)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [
        field,
        stableJsonValue(
          field === FIELD_NAME
            ? document.getXmlFragment(FIELD_NAME).toJSON()
            : value.toJSON(),
        ),
      ]),
  );
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function withDatabase<T>(env: RuntimeEnv, callback: () => Promise<T>) {
  return runWithDbEnv(env, callback);
}
