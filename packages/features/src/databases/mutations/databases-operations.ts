import type { NavDelta } from "../../pages/navigation-model";
import { pagesQueryKey } from "../../pages/queries";
import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseHostEntity, DataSourceEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
import {
  buildDatabaseCreate,
  buildDatabaseFavorite,
  buildDatabaseState,
  buildDatabaseUpdate,
} from "./command-builders";
export type CreateDatabaseInput = {
  name?: string;
  onOptimistic?: (database: DatabaseHostEntity) => void;
  workspaceId: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
};
export type CreateDatabaseResponse = {
  activeDataSource: DataSourceEntity | null;
  database: DatabaseHostEntity;
  navDelta: NavDelta;
};
export type UpdateDatabaseInput = {
  databaseId: string;
  pageId?: string | null;
  expectedPageId?: string | null;
  name?: string;
  configuration?: ConfigurationChange[];
};
export type SetDatabaseFavoriteInput = {
  databaseId: string;
  isFavorite: boolean;
};
export type SetDatabaseFavoriteResponse = {
  databaseId: string;
  isFavorite: boolean;
  workspaceId: string;
};

export type CreateDatabaseResult = CreateDatabaseResponse;
export function createDatabase(
  context: ClientOperationContext,
  input: CreateDatabaseInput,
): Promise<CreateDatabaseResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: CreateDatabaseInput) => {
        const { onOptimistic, ...command } = input;
        const commandId = crypto.randomUUID();
        const saving = controller.execute(buildDatabaseCreate(command), { commandId });
        const preview = controller.creation(commandId)?.creation;
        if (preview) onOptimistic?.(preview.database);
        const ack = await saving;
        return ack.result as CreateDatabaseResponse;
      },
    });
  });
}

export type UpdateDatabaseResult = DatabaseHostEntity;
export function updateDatabase(
  context: ClientOperationContext,
  input: UpdateDatabaseInput,
): Promise<UpdateDatabaseResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async (input: UpdateDatabaseInput) => {
        const ack = await controller.execute(buildDatabaseUpdate(input));
        return ack.result as DatabaseHostEntity;
      },
      onSuccess: async (result, input) => {
        if (input.pageId !== undefined) {
          // Placement membership changes on relocation; ordinary metadata edits stay sparse.
          await queryClient
            .invalidateQueries({ queryKey: pagesQueryKey(result.workspaceId) })
            .catch(() => {});
        }
      },
    });
  });
}

export type DeleteDatabaseResult = {
  database: DatabaseHostEntity | null;
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
};
export type RestoreDatabaseResult = {
  database: DatabaseHostEntity;
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

export type DeleteDatabaseInput = string;
export function deleteDatabase(
  context: ClientOperationContext,
  input: DeleteDatabaseInput,
): Promise<DeleteDatabaseResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (databaseId: DeleteDatabaseInput) =>
        (await controller.execute(buildDatabaseState(databaseId, "database.archive")))
          .result as DeleteDatabaseResult,
    });
  });
}

export type RestoreDatabaseInput = string;
export function restoreDatabase(
  context: ClientOperationContext,
  input: RestoreDatabaseInput,
): Promise<RestoreDatabaseResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (databaseId: RestoreDatabaseInput) =>
        (await controller.execute(buildDatabaseState(databaseId, "database.restore")))
          .result as RestoreDatabaseResult,
    });
  });
}

export type SetDatabaseFavoriteResult = SetDatabaseFavoriteResponse;
export function setDatabaseFavorite(
  context: ClientOperationContext,
  input: SetDatabaseFavoriteInput,
): Promise<SetDatabaseFavoriteResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: SetDatabaseFavoriteInput) =>
        (await controller.execute(buildDatabaseFavorite(input)))
          .result as SetDatabaseFavoriteResponse,
    });
  });
}
