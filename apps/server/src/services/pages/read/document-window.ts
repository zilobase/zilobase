import { deriveContentVerification, type ContentVerification } from "@zilobase/features/search";
import { createHash } from "node:crypto";
import { parsePageDocument } from "@zilobase/features/runtime";
import { prosemirrorToMarkdown, type ResourceRef } from "@zilobase/page-context";
import { ServerOperationError, type ServerOperationContext } from "../../operations/context";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { page } from "../../../infrastructure/database/schema";
import { getEffectivePageAccessInWorkspace } from "../../access/effective-access";
import { hasAccess } from "../../access/access-level";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
} from "../../operations/context";
import { requireActivePageWorkspace } from "../access";
import { getCanonicalWebOrigin } from "../../../shared/config/config";

export async function readPageIdentity(context: ServerOperationContext, pageId: string) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  const actor = requireOperationActor(context);
  const [record] = await db
    .select({
      id: page.id,
      name: page.name,
      metadata: page.metadata,
      workspaceId: page.workspaceId,
      updatedAt: page.updatedAt,
      verifiedAt: page.verifiedAt,
      verifiedById: page.verifiedById,
      verificationExpiresAt: page.verificationExpiresAt,
      verificationUpdatedAt: page.verificationUpdatedAt,
    })
    .from(page)
    .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
    .limit(1);
  if (!record) throw new ServerOperationError({ error: "Page unavailable" }, 404);
  requireOperationWorkspace(context, record.workspaceId);
  if (
    !hasAccess(
      await getEffectivePageAccessInWorkspace(pageId, record.workspaceId, actor.id),
      "view",
    )
  )
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  await requireActivePageWorkspace(context, record.workspaceId, actor.id);
  return record;
}

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};
export type DocumentEntry =
  | { kind: "text"; block: number; text: string }
  | { kind: "reference"; resource: ResourceRef };

/** Only app document references and relative app links are traversable, never arbitrary URLs. */
export function documentReferences(node: Node, webOrigin?: string): ResourceRef[] {
  const found = new Map<string, ResourceRef>();
  const add = (type: ResourceRef["type"], id: unknown) => {
    if (typeof id === "string" && id.length > 0 && id.length <= 128)
      found.set(`${type}:${id}`, { type, id });
  };
  const link = (href: unknown) => {
    if (typeof href !== "string") return;
    let path = href;
    if (/^https?:\/\//.test(href)) {
      try {
        const url = new URL(href);
        if (!webOrigin || url.origin !== webOrigin) return;
        path = url.pathname;
      } catch {
        return;
      }
    }
    const match = path.match(/^\/(?:w\/[^/]+\/)?(p|d|pages?|databases?)\/([^/?#]+)(?:[?#].*)?$/);
    if (match) {
      try {
        add(
          match[1] === "d" || match[1]!.startsWith("database") ? "database" : "page",
          decodeURIComponent(match[2]!),
        );
      } catch {
        /* Malformed links are not source references. */
      }
    }
  };
  const visit = (item: Node) => {
    if (item.type === "databaseBlock") add("database", item.attrs?.databaseId);
    if (item.type === "pageBlock") add("page", item.attrs?.pageId);
    if (item.type === "linkMention") link(item.attrs?.href);
    for (const mark of item.marks ?? []) if (mark.type === "link") link(mark.attrs?.href);
    item.content?.forEach(visit);
  };
  visit(node);
  return [...found.values()];
}

export function documentEntries(document: Node, webOrigin?: string): DocumentEntry[] {
  return (document.content ?? []).flatMap((node, block) => {
    const markdown = prosemirrorToMarkdown({ type: "doc", content: [node] });
    // Code point boundaries preserve split UTF-8 and very large individual blocks.
    const chunks: DocumentEntry[] = [];
    let text = "";
    let bytes = 0;
    for (const char of markdown) {
      const size = Buffer.byteLength(char);
      if (bytes + size > 1500) {
        chunks.push({ kind: "text", block, text });
        text = "";
        bytes = 0;
      }
      text += char;
      bytes += size;
    }
    if (text) chunks.push({ kind: "text", block, text });
    return [
      ...chunks,
      ...documentReferences(node, webOrigin).map((resource) => ({
        kind: "reference" as const,
        resource,
      })),
    ];
  });
}

export async function resolveDocumentPageTitles(
  document: Node,
  readTitle: (id: string) => Promise<string>,
): Promise<Node> {
  const copy = structuredClone(document);
  const titles = new Map<string, Promise<string>>();
  const visit = async (node: Node): Promise<void> => {
    const id = node.type === "pageBlock" ? node.attrs?.pageId : undefined;
    if (typeof id === "string" && id.length > 0 && id.length <= 128) {
      if (!titles.has(id)) titles.set(id, readTitle(id));
      node.attrs = { ...node.attrs, title: await titles.get(id) };
    }
    // Keep metadata lookups ordered without loading any referenced page bodies.
    for (const child of node.content ?? []) await visit(child);
  };
  await visit(copy);
  return copy;
}

export async function readDocumentWindow(
  context: ServerOperationContext,
  input: { pageId: string; offset?: number; revision?: string; limit?: number; outline?: boolean },
) {
  const identity = await readPageIdentity(context, input.pageId);
  const [saved] = await db
    .select({ name: page.name, content: page.content, updatedAt: page.updatedAt })
    .from(page)
    .where(
      and(
        eq(page.id, input.pageId),
        eq(page.workspaceId, identity.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);
  if (!saved) throw new ServerOperationError({ error: "Page is no longer accessible" }, 404);
  const document = await resolveDocumentPageTitles(
    parsePageDocument(saved.content) as Node,
    async (id) => {
      try {
        return (await readPageIdentity(context, id)).name;
      } catch (error) {
        if (error instanceof ServerOperationError && [403, 404].includes(error.status))
          return "Unavailable page";
        throw error;
      }
    },
  );
  const origin = context.env.CLIENT_URL ? getCanonicalWebOrigin(context.env) : undefined;
  const revision = createHash("sha256")
    .update(JSON.stringify([saved.updatedAt, document]))
    .digest("hex");
  if (input.revision && revision !== input.revision)
    throw new ServerOperationError({ error: "SOURCE_CHANGED" }, 409);
  const entries = input.outline
    ? (document.content ?? []).flatMap((node, block): DocumentEntry[] =>
        node.type === "heading"
          ? [{ kind: "text", block, text: prosemirrorToMarkdown({ type: "doc", content: [node] }) }]
          : [],
      )
    : documentEntries(document, origin);
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new ServerOperationError({ error: "Invalid document position" }, 400);
  const limit = Math.min(25, Math.max(1, input.limit ?? 10));
  return {
    ...({ verification: deriveContentVerification(identity) } as {
      verification?: ContentVerification;
    }),
    title: saved.name,
    revision,
    entries: entries.slice(offset, offset + limit),
    offset,
    hasMore: offset + limit < entries.length,
  };
}
