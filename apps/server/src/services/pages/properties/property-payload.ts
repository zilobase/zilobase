import { verificationPropertyValues } from "../verification-values";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  database,
  databaseProperty,
  databaseRow,
  dataSource,
  pageProperty,
  pagePropertyValue,
  page,
} from "../../../infrastructure/database/schema";
import { canAccessDatabaseInWorkspace } from "../../access/effective-access";
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
      dataSourceId: dataSource.id,
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
        dataSourceId: dataSource.id,
        property: pageProperty,
      })
      .from(databaseRow)
      .innerJoin(databaseProperty, eq(databaseRow.dataSourceId, databaseProperty.dataSourceId))
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
    db.select().from(pagePropertyValue).where(eq(pagePropertyValue.pageId, pageId)),
  ]);

  const hasVerification = databaseProperties.some(
    ({ property }) => property.type === "verification",
  );
  const [record] = hasVerification
    ? await db.select().from(page).where(eq(page.id, pageId)).limit(1)
    : [];

  const properties = Array.from(
    new Map(databaseProperties.map(({ property }) => [property.id, property])).values(),
  );
  const accessibleMemberships = (
    await Promise.all(
      memberships.map(async (membership) =>
        (await canAccessDatabaseInWorkspace(membership.databaseId, workspaceId, userId, "view"))
          ? membership
          : null,
      ),
    )
  ).filter((membership): membership is (typeof memberships)[number] => Boolean(membership));
  const databaseIds = accessibleMemberships.map(({ databaseId }) => databaseId);
  const databaseVersions = Object.fromEntries(
    accessibleMemberships.map(({ databaseId, version }) => [databaseId, version]),
  );
  const presenceTargets = accessibleMemberships.map(({ databaseId, dataSourceId, rowId }) => ({
    databaseId,
    dataSourceId,
    propertyIds: [
      ...new Set(
        databaseProperties
          .filter((item) => item.dataSourceId === dataSourceId)
          .map(({ property }) => property.id),
      ),
    ],
    rowId,
  }));

  return {
    workspaceId,
    databaseIds,
    databaseVersions,
    presenceTargets,
    // Keep storage-only fields (including search revisions) out of the public
    // contract. Database views already project these same public entities.
    properties: properties.map((property) => ({
      id: property.id,
      workspaceId: property.workspaceId,
      name: property.name,
      type: property.type,
      config: property.config,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      deletedAt: property.deletedAt,
      deletedById: property.deletedById,
    })),
    values: [
      ...values
        .filter(
          (value) =>
            !properties.some(
              (property) => property.id === value.propertyId && property.type === "verification",
            ),
        )
        .map((value) => ({
          id: value.id,
          pageId: value.pageId,
          propertyId: value.propertyId,
          value: value.value,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        })),
      ...(record ? verificationPropertyValues(record, properties) : []),
    ],
  };
};
