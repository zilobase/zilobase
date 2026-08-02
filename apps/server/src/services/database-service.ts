import { and, eq, isNull } from "drizzle-orm";

import { canAccessPage } from "../access";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import { database, databaseView, page } from "../db/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import { requireDatabaseEditAccess } from "./database-access";
import { commitDatabaseMutation } from "./database-commit";
import type { DatabaseDelta } from "./database-delta";
import { ServiceMutationError } from "./mutation-error";

export async function createDatabaseService(input: {
  name?: string;
  workspaceId: string;
  pageId: string;
  standalone?: boolean;
  userId: string;
}) {
  const name = input.name?.trim() || "New database";

  const [pageRecord] = await db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.id, input.pageId),
        eq(page.workspaceId, input.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  if (!pageRecord) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (!(await canAccessPage(pageRecord.id, input.userId, "edit"))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const databaseId = crypto.randomUUID();
  const defaultViewId = crypto.randomUUID();
  const parentPlacementId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(database).values({
      id: databaseId,
      workspaceId: input.workspaceId,
      createdById: input.userId,
      pageId: input.pageId,
      name,
      config: {},
    });
    await tx.insert(databaseView).values({
      id: defaultViewId,
      databaseId,
      type: "table",
      name: "Table",
      position: 0,
    });
    await upsertPageItemPlacement(tx, {
      id: parentPlacementId,
      workspaceId: input.workspaceId,
      parentKind: "page",
      parentId: input.pageId,
      itemKind: "database",
      itemId: databaseId,
      placementKind: "primary",
    });
  });

  return {
    databaseId,
    defaultViewId,
    name,
    pageId: input.pageId,
  };
}

export async function updateDatabaseService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const values: Partial<typeof database.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = input.config;
  }

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["database"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx.update(database).set(values).where(eq(database.id, existing.id));

      return {
        delta: {
          database: {
            id: existing.id,
            ...values,
          },
        } satisfies DatabaseDelta,
      };
    },
  );

  return { databaseId: existing.id };
}
