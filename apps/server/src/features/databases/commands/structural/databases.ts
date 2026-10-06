import { canAccessPageInWorkspace } from "../../../access";
import { loadWorkspacePageGraph } from "../../../pages/graph/loader";
import { upsertPageItemPlacement } from "../../../pages/placements/page-item-placements";
import { ServiceMutationError } from "../../../../shared/errors/service-mutation-error";
import { and, eq, isNull } from "drizzle-orm";
import { applyConfigurationChanges } from "@zilobase/features/databases/record-interactions";
import type { HostDatabaseCommand } from "@zilobase/features/databases/contracts";

import { database, pageItemPlacement } from "../../../../infrastructure/database/schema";
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "../framework";
import { getDatabaseHostEntity } from "../metadata-entities";

export async function databaseUpdate(
  context: DatabaseCommandContext,
  command: Extract<HostDatabaseCommand, { type: "database.update" }>,
): Promise<DatabaseCommandDispatchResult> {
  const previous = await getDatabaseHostEntity(context, context.databaseId);
  if (command.patch.pageId !== undefined) {
    if (
      command.patch.expectedPageId === undefined ||
      command.patch.expectedPageId !== previous.pageId
    ) {
      throw new ServiceMutationError("Database location changed", 409);
    }
    const destination = command.patch.pageId;
    if (
      destination &&
      !(await canAccessPageInWorkspace(destination, previous.workspaceId, context.actorId, "edit"))
    ) {
      throw new ServiceMutationError("Forbidden", 403);
    }
    if (destination) {
      const graph = await loadWorkspacePageGraph(previous.workspaceId);
      if (graph.getPrimaryNestedDatabasePageIds(previous.id).includes(destination)) {
        throw new ServiceMutationError("Moving would create a cycle", 409);
      }
    }
    await context.transaction
      .update(pageItemPlacement)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(pageItemPlacement.workspaceId, previous.workspaceId),
          eq(pageItemPlacement.itemKind, "database"),
          eq(pageItemPlacement.itemId, previous.id),
          eq(pageItemPlacement.placementKind, "primary"),
          isNull(pageItemPlacement.deletedAt),
        ),
      );
    if (destination)
      await upsertPageItemPlacement(context.transaction, {
        workspaceId: previous.workspaceId,
        parentKind: "page",
        parentId: destination,
        itemKind: "database",
        itemId: previous.id,
        placementKind: "primary",
      });
  }
  await context.transaction
    .update(database)
    .set({
      ...(command.patch.configuration
        ? { config: applyConfigurationChanges(previous.config, command.patch.configuration) }
        : {}),
      ...(command.patch.pageId !== undefined ? { pageId: command.patch.pageId } : {}),
      ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(database.id, context.databaseId));
  const entity = await getDatabaseHostEntity(context, context.databaseId);
  return {
    mutations: [
      {
        areas: ["databases"],
        changes: { databases: [entity] },
        databaseId: context.databaseId,
        dataSourceId: null,
      },
    ],
    result: entity,
  };
}
