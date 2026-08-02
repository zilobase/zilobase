import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { canAccessPage } from "../access";
import { encodePageContentAsYjs } from "../collaboration/service";
import type { RuntimeEnv } from "../config";
import { db } from "../db";
import {
  databaseProperty,
  databaseRow,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../db/schema";
import { upsertPageItemPlacement } from "../page-item-placements";
import { requireDatabaseEditAccess } from "./database-access";
import { commitDatabaseMutation } from "./database-commit";
import { fetchDatabaseRowDelta } from "./database-delta";
import { isDatabaseHostPageId } from "./database-host-page";
import { getStatusDefaultValue } from "./database-property-config";
import { ServiceMutationError } from "./mutation-error";

export async function createDatabaseRowService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  pageId?: string | null;
  parentRowId?: string | null;
  position?: number;
  title?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  if (isDatabaseHostPageId(input.pageId, existing.pageId)) {
    throw new ServiceMutationError(
      "A page cannot be nested inside itself",
      400,
    );
  }

  const rows = await db
    .select({
      id: databaseRow.id,
      pageId: databaseRow.pageId,
      position: databaseRow.position,
    })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.databaseId, existing.id),
        isNull(databaseRow.deletedAt),
      ),
    )
    .orderBy(asc(databaseRow.position));

  const targetPosition =
    input.position === undefined
      ? rows.length
      : Math.min(input.position, rows.length);

  let pageId =
    typeof input.pageId === "string" && input.pageId.length > 0
      ? input.pageId
      : crypto.randomUUID();
  let title = input.title;
  let pageMetadata: Record<string, unknown> = {};

  if (input.pageId) {
    const [pageRecord] = await db
      .select({
        id: page.id,
        metadata: page.metadata,
        name: page.name,
        workspaceId: page.workspaceId,
      })
      .from(page)
      .where(
        and(
          eq(page.id, input.pageId),
          eq(page.workspaceId, existing.workspaceId),
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

    if (title === undefined) {
      title = pageRecord.name.trim() || "Untitled";
    }

    if (
      pageRecord.metadata &&
      typeof pageRecord.metadata === "object" &&
      !Array.isArray(pageRecord.metadata)
    ) {
      pageMetadata = pageRecord.metadata as Record<string, unknown>;
    }
  } else {
    title = title ?? "Untitled";
  }

  if (rows.some((row) => row.pageId === pageId)) {
    throw new ServiceMutationError(
      "This page is already in this database",
      409,
    );
  }

  const statusProperties = await db
    .select({ config: pageProperty.config, id: pageProperty.id })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(
      and(
        eq(databaseProperty.databaseId, existing.id),
        eq(pageProperty.type, "status"),
        isNull(pageProperty.deletedAt),
      ),
    );

  const defaultStatusValues = statusProperties
    .map((property) => ({
      propertyId: property.id,
      value: getStatusDefaultValue(property.config),
    }))
    .filter(
      (property): property is { propertyId: string; value: string } =>
        typeof property.value === "string" && property.value.length > 0,
    );

  const rowId = crypto.randomUUID();

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: defaultStatusValues.length > 0 ? ["rows", "values"] : ["rows"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

      if (input.pageId) {
        await tx
          .update(page)
          .set({
            metadata: pageMetadata,
            updatedAt: now,
          })
          .where(eq(page.id, pageId));
      } else {
        await tx.insert(page).values({
          id: pageId,
          workspaceId: existing.workspaceId,
          createdById: input.userId,
          type: "pageblock",
          name: title as string,
          url: "#",
          content: null,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(pageCollaborationDocument).values({
          pageId,
          state: Buffer.from(encodePageContentAsYjs(null)),
          updatedAt: now,
        });
      }

      await tx
        .update(databaseRow)
        .set({
          position: sql`${databaseRow.position} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(databaseRow.databaseId, existing.id),
            isNull(databaseRow.deletedAt),
            gte(databaseRow.position, targetPosition),
          ),
        );

      await tx.insert(databaseRow).values({
        id: rowId,
        databaseId: existing.id,
        pageId,
        parentRowId: input.parentRowId ?? null,
        position: targetPosition,
        createdById: input.userId,
        lastEditedById: input.userId,
        createdAt: now,
        updatedAt: now,
      });
      await upsertPageItemPlacement(tx, {
        workspaceId: existing.workspaceId,
        parentKind: "database",
        parentId: existing.id,
        itemKind: "page",
        itemId: pageId,
        placementKind: "database_row",
        sourceRowId: rowId,
        position: targetPosition,
      });

      const insertedValues = defaultStatusValues.map((property) => ({
        createdAt: now.toISOString(),
        id: crypto.randomUUID(),
        propertyId: property.propertyId,
        updatedAt: now.toISOString(),
        value: property.value,
        pageId,
      }));

      if (insertedValues.length > 0) {
        await tx.insert(pagePropertyValue).values(
          insertedValues.map((propertyValue) => ({
            id: propertyValue.id,
            propertyId: propertyValue.propertyId,
            value: propertyValue.value,
            pageId: propertyValue.pageId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      const delta = await fetchDatabaseRowDelta(rowId, tx);
      const shiftedRows = rows
        .filter((row) => row.position >= targetPosition)
        .map((row) => ({
          id: row.id,
          position: row.position + 1,
          updatedAt: now.toISOString(),
        }));

      return {
        delta: {
          rows: [...shiftedRows, ...(delta?.rows ?? [])],
          ...(insertedValues.length > 0 ? { values: insertedValues } : {}),
        },
      };
    },
  );

  return {
    databaseId: existing.id,
    rowId,
    rowPageId: pageId,
    title: title as string,
  };
}
