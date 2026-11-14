import { hasPageBodyContent } from "@zilobase/features/runtime";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseRow,
  favorite,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
} from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { hasAccess } from "../../access/access-level";
import {
  canAccessDatabaseInWorkspace,
  canAccessPageInWorkspace,
  getEffectiveTeamspaceAccessInWorkspace,
} from "../../access/effective-access";
import { encodePageContentAsYjs } from "../../collaboration/documents/document-codec";
import { TeamspaceManagementService } from "../../teamspaces/management";
import { loadWorkspacePageGraph } from "../graph/loader";
import {
  softDeletePageItemPlacement,
  upsertPageItemPlacement,
  type ItemRef,
} from "../placements/page-item-placements";
import type { PageRecord } from "../read/page-records";

export async function createHierarchicalPage(
  input: {
    workspaceId: string;
    type: string;
    name: string;
    url: string;
    content: unknown;
    metadata: unknown;
    parentItemId: string | null;
    teamspaceId: string | null;
    /** Trusted callers (workspace actions) reserve IDs so retries stay idempotent. */
    requestedPageId?: string;
  },
  user: { id: string },
) {
  const { workspaceId, type, name, url, content, metadata, parentItemId, teamspaceId } = input;
  const [parentRecord] =
    typeof parentItemId === "string"
      ? await db
          .select({ teamspaceId: page.teamspaceId })
          .from(page)
          .where(
            and(
              eq(page.id, parentItemId),
              eq(page.workspaceId, workspaceId),
              isNull(page.deletedAt),
            ),
          )
          .limit(1)
      : [];
  const resolvedTeamspaceId = parentRecord?.teamspaceId ?? teamspaceId;

  if (parentRecord && teamspaceId !== null && teamspaceId !== parentRecord.teamspaceId) {
    throw new ServiceMutationError("A nested page must use its parent teamspace.", 409);
  }

  if (
    resolvedTeamspaceId &&
    !hasAccess(
      await getEffectiveTeamspaceAccessInWorkspace(resolvedTeamspaceId, workspaceId, user.id),
      "edit",
    )
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const pageId = input.requestedPageId ?? crypto.randomUUID();
  const [parentFavorite] = parentItemId
    ? await db
        .select({ id: favorite.id })
        .from(favorite)
        .where(and(eq(favorite.userId, user.id), eq(favorite.pageId, parentItemId)))
        .limit(1)
    : [];
  const shouldInheritFavorite = Boolean(parentFavorite);
  const placementId = parentItemId ? crypto.randomUUID() : null;
  const placement = parentItemId
    ? {
        id: placementId as string,
        workspaceId,
        parentKind: "page" as const,
        parentId: parentItemId,
        itemKind: "page" as const,
        itemId: pageId,
        placementKind: "primary" as const,
        sourceRowId: null,
        position: 0,
      }
    : null;
  const { record } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(page)
      .values({
        id: pageId,
        workspaceId,
        createdById: user.id,
        type,
        name,
        url,
        content,
        hasContent: hasPageBodyContent(content),
        metadata,
        teamspaceId: resolvedTeamspaceId,
      })
      .returning();

    if (parentItemId) {
      await upsertPageItemPlacement(tx, {
        id: placement?.id,
        workspaceId,
        parentKind: "page",
        parentId: parentItemId,
        itemKind: "page",
        itemId: pageId,
        placementKind: "primary",
      });
    }

    await tx.insert(pageCollaborationDocument).values({
      pageId,
      state: Buffer.from(encodePageContentAsYjs(content)),
      updatedAt: new Date(),
    });

    if (shouldInheritFavorite) {
      await tx
        .insert(favorite)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          pageId,
        })
        .onConflictDoNothing({
          target: [favorite.userId, favorite.pageId],
        });
    }

    return { record: created };
  });

  const pagePayload = { ...record, isFavorite: shouldInheritFavorite };

  return {
    navDelta: {
      upsertPlacements: placement ? [placement] : [],
      upsertPages: [pagePayload],
    },
    page: pagePayload,
  };
}

export async function movePageToTeamspace(record: PageRecord, destinationId: string | null) {
  const graph = await loadWorkspacePageGraph(record.workspaceId);
  const pageIds = graph.getPrimaryNestedPageIds(record.id);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({ teamspaceId: destinationId, updatedAt: now })
      .where(inArray(page.id, pageIds));
    await tx
      .update(database)
      .set({ teamspaceId: destinationId, updatedAt: now })
      .where(inArray(database.pageId, pageIds));
    await tx
      .update(pageItemPlacement)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, record.workspaceId),
          eq(pageItemPlacement.itemKind, "page"),
          eq(pageItemPlacement.itemId, record.id),
          eq(pageItemPlacement.placementKind, "primary"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );
  });

  return { movedPageIds: pageIds, teamspaceId: destinationId };
}

export async function convertPageToTeamspace(
  service: TeamspaceManagementService,
  record: PageRecord,
  user: { id: string },
  accessMode: "open" | "closed" | "private",
  requestedName: string,
) {
  const created = await service.create({
    accessMode,
    name: requestedName || record.name.trim() || "Untitled teamspace",
    userId: user.id,
    workspaceId: record.workspaceId,
  });
  const graph = await loadWorkspacePageGraph(record.workspaceId);
  const pageIds = graph.getPrimaryNestedPageIds(record.id);
  await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({ teamspaceId: created.id, updatedAt: new Date() })
      .where(inArray(page.id, pageIds));
    await tx
      .update(database)
      .set({ teamspaceId: created.id, updatedAt: new Date() })
      .where(inArray(database.pageId, pageIds));
    await tx
      .update(pageItemPlacement)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, record.workspaceId),
          eq(pageItemPlacement.itemKind, "page"),
          eq(pageItemPlacement.itemId, record.id),
          eq(pageItemPlacement.placementKind, "primary"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );
  });

  return { movedPageIds: pageIds, teamspace: created };
}

export async function embedPageItem(
  host: PageRecord,
  user: { id: string },
  itemId: string,
  kind: "page" | "database",
) {
  if (kind === "page") {
    if (itemId === host.id) {
      throw new ServiceMutationError("A page cannot be nested inside itself", 400);
    }

    const [child] = await db
      .select()
      .from(page)
      .where(
        and(eq(page.id, itemId), eq(page.workspaceId, host.workspaceId), isNull(page.deletedAt)),
      )
      .limit(1);

    if (!child) {
      throw new ServiceMutationError("Page not found", 404);
    }

    if (!(await canAccessPageInWorkspace(child.id, child.workspaceId, user.id, "view"))) {
      throw new ServiceMutationError("Forbidden", 403);
    }

    const graph = await loadWorkspacePageGraph(host.workspaceId);

    if (graph.getPrimaryNestedPageIds(child.id).includes(host.id)) {
      throw new ServiceMutationError("Embedding would create a cycle", 400);
    }

    const [primaryPlacement, sourceDatabaseRow] = await Promise.all([
      db
        .select({ parentId: pageItemPlacement.parentId })
        .from(pageItemPlacement)
        .where(
          and(
            eq(pageItemPlacement.workspaceId, host.workspaceId),
            eq(pageItemPlacement.itemKind, "page"),
            eq(pageItemPlacement.itemId, child.id),
            eq(pageItemPlacement.placementKind, "primary"),
            isNull(pageItemPlacement.deletedAt),
          ),
        )
        .limit(1),
      db
        .select({ id: databaseRow.id })
        .from(databaseRow)
        .where(and(eq(databaseRow.pageId, child.id), isNull(databaseRow.deletedAt)))
        .limit(1),
    ]);
    const action =
      primaryPlacement[0]?.parentId === host.id
        ? "setParent"
        : primaryPlacement.length === 0 && sourceDatabaseRow.length === 0
          ? "setParent"
          : "addLink";

    let placementId: string | null = null;
    if (primaryPlacement[0]?.parentId !== host.id) {
      placementId = await db.transaction(async (tx) => {
        return upsertPageItemPlacement(tx, {
          workspaceId: host.workspaceId,
          parentKind: "page",
          parentId: host.id,
          itemKind: "page",
          itemId: child.id,
          placementKind: action === "setParent" ? "primary" : "linked",
        });
      });
    }

    return {
      action,
      host,
      placementId,
    };
  }

  const [databaseRecord] = await db
    .select()
    .from(database)
    .where(
      and(
        eq(database.id, itemId),
        eq(database.workspaceId, host.workspaceId),
        isNull(database.deletedAt),
      ),
    )
    .limit(1);

  if (!databaseRecord) {
    throw new ServiceMutationError("Database not found", 404);
  }

  if (
    !(await canAccessDatabaseInWorkspace(
      databaseRecord.id,
      databaseRecord.workspaceId,
      user.id,
      "view",
    ))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  if (databaseRecord.pageId === host.id) {
    return { action: "setParent", host, placementId: null };
  }

  const placementId = await db.transaction(async (tx) => {
    return upsertPageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      itemKind: "database",
      itemId: databaseRecord.id,
      placementKind: "linked",
    });
  });

  return { action: "addLink", host, placementId };
}

export async function unembedPageItem(
  host: PageRecord,
  itemId: string,
  kind: "page" | "database",
  placementId: unknown,
) {
  const ref: ItemRef = { id: itemId, kind };
  const [placement] = await db
    .select({ placementKind: pageItemPlacement.placementKind })
    .from(pageItemPlacement)
    .where(
      and(
        eq(pageItemPlacement.workspaceId, host.workspaceId),
        eq(pageItemPlacement.parentKind, "page"),
        eq(pageItemPlacement.parentId, host.id),
        eq(pageItemPlacement.itemKind, kind),
        eq(pageItemPlacement.itemId, itemId),
        isNull(pageItemPlacement.deletedAt),
      ),
    )
    .limit(1);

  await db.transaction(async (tx) => {
    await softDeletePageItemPlacement(tx, {
      workspaceId: host.workspaceId,
      parentKind: "page",
      parentId: host.id,
      item: ref,
      placementId: typeof placementId === "string" ? placementId : undefined,
    });
  });

  return {
    action: placement?.placementKind === "primary" ? "clearParent" : "removeLink",
  };
}
