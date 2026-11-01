import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseViewEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
import { buildViewCreate, buildViewDelete, buildViewUpdate } from "./command-builders";
export type UpdateDatabaseViewInput = {
  configuration?: ConfigurationChange[];
  databaseId: string;
  databaseViewId: string;
  name?: string;
  type?: string;
};
export type AddDatabaseViewInput = {
  onOptimistic?: (view: DatabaseViewEntity) => void;
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
export type DeleteDatabaseViewInput = {
  databaseId: string;
  databaseViewId: string;
};

export type UpdateDatabaseViewResult = DatabaseViewEntity;
export function updateDatabaseView(
  context: ClientOperationContext,
  input: UpdateDatabaseViewInput,
): Promise<UpdateDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: UpdateDatabaseViewInput) => {
        const ack = await controller.execute(buildViewUpdate(input));
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type AddDatabaseViewResult = DatabaseViewEntity;
export function addDatabaseView(
  context: ClientOperationContext,
  input: AddDatabaseViewInput,
): Promise<AddDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ onOptimistic, ...input }: AddDatabaseViewInput) => {
        const { databaseId } = input;
        const commandId = crypto.randomUUID();
        const saving = controller.execute(buildViewCreate(input), { commandId });
        const preview = controller
          .bootstrap(databaseId)
          ?.views.find((view) => view.id === commandId);
        if (preview) onOptimistic?.(preview);
        const ack = await saving;
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type DeleteDatabaseViewResult = {
  viewId: string;
};
export function deleteDatabaseView(
  context: ClientOperationContext,
  input: DeleteDatabaseViewInput,
): Promise<DeleteDatabaseViewResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: DeleteDatabaseViewInput) => {
        const ack = await controller.execute(buildViewDelete(input));
        return ack.result as {
          viewId: string;
        };
      },
    });
  });
}
