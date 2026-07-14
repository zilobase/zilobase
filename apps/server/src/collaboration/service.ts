import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus } from "@hocuspocus/server";
import { ProsemirrorTransformer } from "@hocuspocus/transformer";
import { and, eq, isNull } from "drizzle-orm";
import { Schema, type MarkSpec, type NodeSpec } from "@tiptap/pm/model";
import * as Y from "yjs";
import { canAccessPageInWorkspace } from "../access";
import { createDbClient, db, runWithDbClient } from "../db";
import { page, pageCollaborationDocument } from "../db/schema";
import { getRuntimeAdapter } from "../runtime-adapter";
import type { RuntimeEnv } from "../config";

const DOCUMENT_PREFIX = "page:";
const FIELD_NAME = "default";
const TICKET_TTL_MS = 5 * 60 * 1000;

export type CollaborationTicketClaims = {
  exp: number;
  pageId: string;
  scope: "read-write" | "readonly";
  userId: string;
  workspaceId: string;
};

export type CollaborationContext = CollaborationTicketClaims;

export function documentNameForPage(pageId: string) {
  return `${DOCUMENT_PREFIX}${pageId}`;
}

export function pageIdFromDocumentName(documentName: string) {
  return documentName.startsWith(DOCUMENT_PREFIX)
    ? documentName.slice(DOCUMENT_PREFIX.length)
    : null;
}

export async function createCollaborationTicket(
  claims: Omit<CollaborationTicketClaims, "exp">,
  env: RuntimeEnv,
) {
  const payload: CollaborationTicketClaims = {
    ...claims,
    exp: Date.now() + TICKET_TTL_MS,
  };
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

  if (stored) {
    return new Uint8Array(stored.state);
  }

  const state = encodePageContentAsYjs(null);
  const [inserted] = await db
    .insert(pageCollaborationDocument)
    .values({ pageId, state: Buffer.from(state), updatedAt: new Date() })
    .onConflictDoNothing()
    .returning({ state: pageCollaborationDocument.state });

  if (inserted) {
    return new Uint8Array(inserted.state);
  }

  // Another request initialized the document concurrently. Its state is the
  // canonical base both the client and Durable Object must use.
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

export function createCollaborationHocuspocus(env: RuntimeEnv) {
  const documentLoads = new Map<string, Promise<Uint8Array>>();

  const preloadDocument = (documentName: string) => {
    const existing = documentLoads.get(documentName);

    if (existing) {
      return existing;
    }

    const load = loadDocument(documentName, env);
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
      new Database({
        fetch: async ({ documentName }) => consumeDocument(documentName),
        store: async ({ documentName, document, state }) =>
          storeDocument(documentName, document, state, env),
      }),
    ],
    async onAuthenticate({ connectionConfig, documentName, requestParameters, token }) {
      const authenticateStartedAt = performance.now();
      const claims = await verifyCollaborationTicket(token, env);
      const ticketVerifyMs = Math.round(
        performance.now() - authenticateStartedAt,
      );
      const pageId = pageIdFromDocumentName(documentName);
      const routedDocumentName = requestParameters.get("document");

      if (!pageId || pageId !== claims.pageId) {
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
      const allowed = await withDatabase(env, () =>
        canAccessPageInWorkspace(
          claims.pageId,
          claims.workspaceId,
          claims.userId,
          claims.scope === "readonly" ? "view" : "edit",
        ),
      );
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
  });
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

  if (!pageId) {
    throw new Error("Invalid collaboration document name");
  }

  const loadStartedAt = performance.now();
  let source: "collaboration_state" | "missing" = "missing";

  try {
    return await withDatabase(env, async () => {
      const [stored] = await db
        .select({ state: pageCollaborationDocument.state })
        .from(pageCollaborationDocument)
        .where(eq(pageCollaborationDocument.pageId, pageId))
        .limit(1);

      if (stored) {
        source = "collaboration_state";
        return new Uint8Array(stored.state);
      }

      const [record] = await db
        .select({ id: page.id })
        .from(page)
        .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
        .limit(1);

      if (!record) {
        throw new Error("Page not found");
      }

      throw new Error("Page collaboration state is missing");
    });
  } finally {
    console.info(
      JSON.stringify({
        event: "collaboration_document_loaded",
        loadMs: Math.round(performance.now() - loadStartedAt),
        source,
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

  if (!pageId) {
    throw new Error("Invalid collaboration document name");
  }

  const content = compactMaterializedJson(
    ProsemirrorTransformer.fromYdoc(document, FIELD_NAME),
  );
  const now = new Date();

  await withDatabase(env, () =>
    db.transaction(async (tx) => {
      await tx
        .insert(pageCollaborationDocument)
        .values({ pageId, state: Buffer.from(state), updatedAt: now })
        .onConflictDoUpdate({
          target: pageCollaborationDocument.pageId,
          set: { state: Buffer.from(state), updatedAt: now },
        });
      await tx
        .update(page)
        .set({ content, updatedAt: now })
        .where(eq(page.id, pageId));
    }),
  );
}

function toYDoc(content: unknown) {
  const normalized = normalizeDocument(content);
  return ProsemirrorTransformer.toYdoc(
    normalized,
    FIELD_NAME,
    createSchemaForDocument(normalized),
  );
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
    typeof claims.pageId === "string" &&
    (claims.scope === "read-write" || claims.scope === "readonly") &&
    typeof claims.userId === "string" &&
    typeof claims.workspaceId === "string"
  );
}

function withDatabase<T>(env: RuntimeEnv, callback: () => Promise<T>) {
  return runWithDbClient(createDbClient(env), callback);
}
