import { and, eq, isNull } from "drizzle-orm";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";
import {
  insertDatabaseBlockInContent,
  shouldShowInlineDatabaseTitle,
} from "@zilobase/page-context/insert-database-block";

import {
  canAccessDatabaseInWorkspace,
  canAccessPage,
  getMembership,
} from "../../access";
import { db } from "../../../infrastructure/database";
import { database, page, pageCollaborationDocument } from "../../../infrastructure/database/schema";
import {
  encodePageContentAsYjs,
  getOrCreateCollaborationDocumentState,
  isEmptyPageContent,
  materializePageContentFromYjs,
  replacePageContent,
} from "../../collaboration/service";
import type { RuntimeEnv } from "../../../shared/config/config";
import { enqueueNavigationInvalidation, publishCommittedNavigationInvalidation } from "../../workspaces/navigation-realtime/outbox";
import { upsertPageItemPlacement } from "../placements/page-item-placements";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export async function createPageService(input: {
  content?: unknown;
  metadata?: unknown;
  name?: string;
  parentPageId?: string;
  workspaceId: string;
  type?: string;
  url?: string;
  userId: string;
  env?: RuntimeEnv;
}) {
  if (input.parentPageId) {
    const [parent] = await db
      .select({ workspaceId: page.workspaceId })
      .from(page)
      .where(and(eq(page.id, input.parentPageId), isNull(page.deletedAt)))
      .limit(1);

    if (
      !parent ||
      parent.workspaceId !== input.workspaceId ||
      !(await canAccessPage(input.parentPageId, input.userId, "edit"))
    ) {
      throw new ServiceMutationError("Forbidden", 403);
    }
  } else if (!(await getMembership(input.workspaceId, input.userId))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const pageId = crypto.randomUUID();
  const parentPlacementId = input.parentPageId ? crypto.randomUUID() : null;

  const { record, navigationEvent } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(page)
      .values({
        id: pageId,
        workspaceId: input.workspaceId,
        createdById: input.userId,
        type: input.type ?? "pageblock",
        name: input.name ?? "",
        url: input.url ?? "#",
        content: input.content ?? null,
        hasContent: hasPageBodyContent(input.content),
        metadata: input.metadata ?? null,
      })
      .returning();

    if (input.parentPageId) {
      await upsertPageItemPlacement(tx, {
        id: parentPlacementId!,
        workspaceId: input.workspaceId,
        parentKind: "page",
        parentId: input.parentPageId,
        itemKind: "page",
        itemId: pageId,
        placementKind: "primary",
      });
    }

    await tx.insert(pageCollaborationDocument).values({
      pageId,
      state: Buffer.from(encodePageContentAsYjs(input.content ?? null)),
      updatedAt: new Date(),
    });

    const navigationEvent = await enqueueNavigationInvalidation(tx, input.workspaceId);
    return { record: created, navigationEvent };
  });
  await publishCommittedNavigationInvalidation(navigationEvent, input.env);

  return {
    page: record,
    pageId: record.id,
    parentPlacement: parentPlacementId && input.parentPageId
      ? {
          id: parentPlacementId,
          workspaceId: input.workspaceId,
          parentKind: "page" as const,
          parentId: input.parentPageId,
          itemKind: "page" as const,
          itemId: record.id,
          placementKind: "primary" as const,
          sourceRowId: null,
          position: 0,
        }
      : null,
  };
}

export async function linkDatabaseInPageService(input: {
  databaseId: string;
  hostPageId: string;
  userId: string;
}) {
  const [host] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, input.hostPageId), isNull(page.deletedAt)))
    .limit(1);

  if (!host) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (!(await canAccessPage(host.id, input.userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const [databaseRecord] = await db
    .select()
    .from(database)
    .where(
      and(
        eq(database.id, input.databaseId),
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
      input.userId,
      "view",
    ))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  if (databaseRecord.pageId === host.id) {
    return {
      action: "setParent" as const,
      hostPageId: host.id,
      databaseId: databaseRecord.id,
    };
  }

  await upsertPageItemPlacement(db, {
    workspaceId: host.workspaceId,
    parentKind: "page",
    parentId: host.id,
    itemKind: "database",
    itemId: databaseRecord.id,
    placementKind: "linked",
  });

  return {
    action: "addLink" as const,
    hostPageId: host.id,
    databaseId: databaseRecord.id,
  };
}

export async function embedDatabaseInPageService(input: {
  afterHeading?: string;
  databaseId: string;
  env: RuntimeEnv;
  showTitle?: boolean;
  userId: string;
  pageId: string;
}) {
  const [existing] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (!(await canAccessPage(existing.id, input.userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const [databaseRecord] = await db
    .select({
      id: database.id,
      name: database.name,
      workspaceId: database.workspaceId,
    })
    .from(database)
    .where(and(eq(database.id, input.databaseId), isNull(database.deletedAt)))
    .limit(1);

  if (!databaseRecord) {
    throw new ServiceMutationError("Database not found", 404);
  }

  if (databaseRecord.workspaceId !== existing.workspaceId) {
    throw new ServiceMutationError("Database not found", 404);
  }

  let baseContent = existing.content;

  try {
    const collaborationState = await getOrCreateCollaborationDocumentState(
      existing.id,
    );
    const liveContent = materializePageContentFromYjs(collaborationState);

    if (!isEmptyPageContent(liveContent)) {
      baseContent = liveContent;
    }
  } catch {
    // Fall back to the stored page snapshot when collaboration state is missing.
  }

  const showTitle = input.showTitle ??
    shouldShowInlineDatabaseTitle(existing.name, databaseRecord.name);
  const { content, alreadyEmbedded, titleUpdated } = insertDatabaseBlockInContent(
    baseContent,
    {
      afterHeading: input.afterHeading,
      databaseId: input.databaseId,
      showTitle,
    },
  );

  if (alreadyEmbedded && !titleUpdated) {
    return {
      alreadyEmbedded: true,
      databaseId: input.databaseId,
      embedMarkdown: `[Database (${input.databaseId})]`,
      pageId: existing.id,
      showTitle,
      titleUpdated: false,
    };
  }

  await replacePageContent({
    content,
    env: input.env,
    pageId: existing.id,
    userId: input.userId,
  });

  const updated = {
    ...existing,
    content,
    updatedAt: new Date(),
  };

  return {
    alreadyEmbedded,
    databaseId: input.databaseId,
    embedMarkdown: `[Database (${input.databaseId})]`,
    page: updated,
    pageId: existing.id,
    showTitle,
    titleUpdated,
  };
}
