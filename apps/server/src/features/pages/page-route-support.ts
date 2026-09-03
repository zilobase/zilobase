import { and, asc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { canAccessDatabaseInWorkspace, getPageRecord, rejectActiveWorkspaceMismatch } from "../access";
import { db } from "../../infrastructure/database";
import { database, dataSource, databaseProperty, databaseRow, page, pageProperty, pagePropertyValue } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { loadWorkspacePageGraph } from "./graph/loader";

export const getPage = getPageRecord;

export const getPageIncludingDeleted = async (id: string) => {
  const [record] = await db.select().from(page).where(eq(page.id, id)).limit(1);

  return record ?? null;
};

export const enforceActiveWorkspace = (
  c: Context<AppBindings>,
  workspaceId: string,
  userId: string,
) => rejectActiveWorkspaceMismatch(c, workspaceId, userId);

export const getPagePropertyPayload = async (
  pageId: string,
  workspaceId: string,
  userId: string,
) => {
  // Read versions first. If a mutation commits between these reads, the
  // payload is conservatively marked with the older version and the realtime
  // handshake will refetch it instead of treating stale data as current.
  const memberships = await db
    .selectDistinct({
      databaseId: dataSource.parentDatabaseId,
      rowId: databaseRow.id,
      version: database.version,
    })
    .from(databaseRow)
    .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
    .innerJoin(database, eq(dataSource.parentDatabaseId, database.id))
    .where(
      and(
        eq(databaseRow.pageId, pageId),
        isNull(databaseRow.deletedAt),
        isNull(database.deletedAt),
      ),
    );
  const [databaseProperties, values] = await Promise.all([
    db
      .select({
        databaseId: dataSource.parentDatabaseId,
        property: pageProperty,
      })
      .from(databaseRow)
      .innerJoin(
        databaseProperty,
        eq(databaseRow.dataSourceId, databaseProperty.dataSourceId),
      )
      .innerJoin(dataSource, eq(databaseRow.dataSourceId, dataSource.id))
      .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
      .where(
        and(
          eq(databaseRow.pageId, pageId),
          eq(pageProperty.workspaceId, workspaceId),
          isNull(databaseRow.deletedAt),
          isNull(pageProperty.deletedAt),
        ),
      )
      .orderBy(asc(pageProperty.createdAt)),
    db
      .select()
      .from(pagePropertyValue)
      .where(eq(pagePropertyValue.pageId, pageId)),
  ]);

  const properties = Array.from(
    new Map(
      databaseProperties.map(({ property }) => [property.id, property]),
    ).values(),
  );
  const accessibleMemberships = (
    await Promise.all(
      memberships.map(async (membership) =>
        (await canAccessDatabaseInWorkspace(
          membership.databaseId,
          workspaceId,
          userId,
          "view",
        ))
          ? membership
          : null,
      ),
    )
  ).filter((membership): membership is (typeof memberships)[number] =>
    Boolean(membership),
  );
  const databaseIds = accessibleMemberships.map(
    ({ databaseId }) => databaseId,
  );
  const databaseVersions = Object.fromEntries(
    accessibleMemberships.map(({ databaseId, version }) => [
      databaseId,
      version,
    ]),
  );
  const presenceTargets = accessibleMemberships.map(
    ({ databaseId, rowId }) => ({
      databaseId,
      propertyIds: [
        ...new Set(
          databaseProperties
            .filter((item) => item.databaseId === databaseId)
            .map(({ property }) => property.id),
        ),
      ],
      rowId,
    }),
  );

  return {
    databaseIds,
    databaseVersions,
    presenceTargets,
    properties,
    values,
  };
};

export const getNestedFavoriteTargetIds = async (
  rootPageId: string,
  workspaceId: string,
  accessibleIds: Set<string>,
) => {
  const graph = await loadWorkspacePageGraph(workspaceId);
  const pageIds = graph.getNestedPageIds(rootPageId, accessibleIds);

  return {
    databaseIds: graph.getDatabaseIdsForPageIds(pageIds, accessibleIds),
    pageIds,
  };
};

