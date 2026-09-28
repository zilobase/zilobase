import type { DatabaseCommand } from "@zilobase/features/databases/contracts";
import type { DatabaseCommandContext, DatabaseCommandDispatchResult } from "./framework";
import {
  createDatabaseService,
  deleteDatabaseService,
  restoreDatabaseService,
} from "../core/service";
import { updateDatabaseFavoriteService } from "../core/favorite-service";
import { getDatabaseExportPayload } from "../core/payload";
import { getDatabaseHostEntity } from "./metadata-entities";
import {
  deleteDatabaseAccessRuleService,
  deletePublicDatabaseAccessService,
  upsertDatabaseAccessRuleService,
} from "../sharing/service";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

/** Domain services run inside the command transaction, including their reads/savepoints. */
export async function dispatchLifecycleCommand(
  context: DatabaseCommandContext,
  command: DatabaseCommand,
): Promise<DatabaseCommandDispatchResult | null> {
  const input = {
    databaseId: context.databaseId,
    userId: context.actorId,
    afterCommit: context.afterCommit,
  };
  let result: unknown;
  let affected = [context.databaseId];
  switch (command.type) {
    case "database.create": {
      const created = await createDatabaseService({
        ...command,
        userId: context.actorId,
        newDatabaseId: context.databaseId,
        afterCommit: context.afterCommit,
      });
      const payload = await getDatabaseExportPayload(created.databaseId, context.actorId);
      if (!payload) throw new ServiceMutationError("Database not found", 404);
      result = {
        ...payload,
        database: { ...payload.database, accessLevel: "full" },
        navDelta: {
          upsertDatabases: [{ ...payload.database, accessLevel: "full", views: payload.views }],
          upsertPlacements: created.parentPlacement ? [created.parentPlacement] : [],
        },
      };
      break;
    }
    case "database.archive": {
      const deleted = await deleteDatabaseService(input);
      affected = deleted.deletedDatabaseIds;
      result = deleted;
      break;
    }
    case "database.restore": {
      const restored = await restoreDatabaseService(input);
      affected = [...new Set([context.databaseId, ...restored.restoredDatabaseIds])];
      result = restored;
      break;
    }
    case "database.favorite":
      result = await updateDatabaseFavoriteService({ ...input, favorite: command.favorite });
      return { result, mutations: [] };
    case "access.upsert":
      result = await upsertDatabaseAccessRuleService({ ...input, body: command });
      break;
    case "access.remove":
      result = await deleteDatabaseAccessRuleService({ ...input, ruleId: command.ruleId });
      break;
    case "database.publish":
      result = command.published
        ? await upsertDatabaseAccessRuleService({
            ...input,
            body: { accessLevel: "view", targetType: "public", targetId: "*" },
          })
        : await deletePublicDatabaseAccessService(input);
      break;
    default:
      return null;
  }
  return {
    result,
    mutations: await Promise.all(
      affected.map(async (databaseId) => ({
        databaseId,
        dataSourceId: null,
        areas: ["databases"] as Array<"databases">,
        changes: { databases: [await getDatabaseHostEntity(context, databaseId)] },
        requiresReset: true as const,
      })),
    ),
  };
}
