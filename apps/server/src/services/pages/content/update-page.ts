import { nudgeSearchIndexing } from "../../search/invalidation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { databaseRow, dataSource, page } from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { lockDatabaseAutomationFactRows } from "../../automations/triggers/event-capture";
import { replacePageContent } from "../../collaboration/mutations/document-mutations";
import { getDatabaseRecordEntity } from "../../databases/commands/record-entity";
import { commitDatabaseMutationBatch } from "../../databases/mutations/commit";
import type { PageRecord } from "../read/page-records";
import { getPageContentRevision } from "../read/page-records";
export async function updatePage(
  existing: PageRecord,
  user: { id: string },
  patch: { type?: unknown; name?: unknown; url?: unknown; metadata?: unknown; content?: unknown },
  env: RuntimeEnv,
  apiKey: boolean,
) {
  const values: Partial<typeof page.$inferInsert> = {
    updatedAt: new Date(),
    ...(patch.name !== undefined && patch.name !== existing.name
      ? { lastEditedById: user.id, lastEditedAt: new Date() }
      : {}),
  };

  if (patch.type !== undefined) {
    if (typeof patch.type !== "string") {
      throw new ServiceMutationError("type must be a string", 400);
    }

    values.type = patch.type;
  }

  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      throw new ServiceMutationError("name must be a string", 400);
    }

    values.name = patch.name;
  }

  if (patch.url !== undefined) {
    if (typeof patch.url !== "string") {
      throw new ServiceMutationError("url must be a string", 400);
    }

    values.url = patch.url;
  }

  if (patch.metadata !== undefined) {
    if (
      patch.metadata !== null &&
      (typeof patch.metadata !== "object" || Array.isArray(patch.metadata))
    )
      throw new ServiceMutationError("metadata must be an object or null", 400);
    values.metadata =
      patch.metadata === null
        ? null
        : sql`COALESCE(${page.metadata}, '{}'::jsonb) || ${JSON.stringify(patch.metadata)}::jsonb`;
  }

  const updatesDatabaseRow = patch.name !== undefined || patch.metadata !== undefined;
  const mutationResult = updatesDatabaseRow
    ? (
        await commitDatabaseMutationBatch({ actorId: user.id, env: env }, async (tx) => {
          const rowMemberships = await tx
            .select({
              dataSourceId: databaseRow.dataSourceId,
              rowId: databaseRow.id,
            })
            .from(databaseRow)
            .where(and(eq(databaseRow.pageId, existing.id), isNull(databaseRow.deletedAt)));
          await lockDatabaseAutomationFactRows(tx, rowMemberships);
          const [updatedPage] = await tx
            .update(page)
            .set(values)
            .where(eq(page.id, existing.id))
            .returning();

          if (!updatedPage) {
            throw new Error("Page disappeared during update");
          }

          const rows = await tx
            .select({
              databaseId: dataSource.parentDatabaseId,
              dataSourceId: dataSource.id,
              row: databaseRow,
            })
            .from(databaseRow)
            .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
            .where(and(eq(databaseRow.pageId, existing.id), isNull(databaseRow.deletedAt)));

          return {
            automationFacts:
              patch.name === undefined
                ? []
                : rows.map(({ dataSourceId, row }) => ({
                    actorId: user.id,
                    changedValues: [
                      {
                        after: updatedPage.name,
                        before: existing.name,
                        propertyId: "name",
                      },
                    ],
                    dataSourceId,
                    origin: apiKey ? ("api" as const) : ("user" as const),
                    pageId: existing.id,
                    rowId: row.id,
                  })),
            mutations: await Promise.all(
              rows.map(async ({ databaseId, dataSourceId, row }) => ({
                areas: ["records" as const],
                changes: { records: [await getDatabaseRecordEntity(tx, dataSourceId, row.id)] },
                databaseId,
                dataSourceId,
              })),
            ),
            result: {
              page: updatedPage,
            },
          };
        })
      ).result
    : await db.transaction(async (tx) => {
        const [updatedPage] = await tx
          .update(page)
          .set(values)
          .where(eq(page.id, existing.id))
          .returning();
        return {
          page: updatedPage,
        };
      });
  const record = mutationResult.page;

  if (!record) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (patch.content !== undefined) {
    await replacePageContent({
      content: patch.content,
      env: env,
      pageId: existing.id,
      userId: user.id,
    });
    record.content = patch.content;
  }

  await nudgeSearchIndexing(env);
  return { page: record };
}

export async function replacePageBody(
  existing: PageRecord,
  user: { id: string },
  content: unknown,
  env: RuntimeEnv,
  baseRevision?: Date,
) {
  if (baseRevision && baseRevision.toISOString() !== existing.updatedAt.toISOString()) {
    return { conflict: { id: existing.id, updatedAt: existing.updatedAt } };
  }
  await replacePageContent({ content, env, pageId: existing.id, userId: user.id });
  const record = await getPageContentRevision(existing.id);
  if (!record) throw new ServiceMutationError("Page not found", 404);
  return { page: record };
}
