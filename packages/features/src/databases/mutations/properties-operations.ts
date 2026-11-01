import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabasePropertyEntity } from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
import {
  buildPropertyCreate,
  buildPropertyDuplicate,
  buildPropertyState,
  buildPropertyUpdate,
  buildTemplateApply,
} from "./command-builders";
import { resolveDataSourceCommandScope } from "./scope";
export type AddPropertyInput = {
  onOptimistic?: (property: DatabasePropertyEntity) => void;
  config?: unknown;
  databaseId: string;
  name?: string;
  position?: number;
  type?: string;
};
export type ApplyDatabaseTemplateInput = {
  hostDatabaseId?: string;
  config: unknown;
  databaseId: string;
  name: string;
  properties: Array<{
    config?: unknown;
    name: string;
    type: string;
  }>;
  rows: Array<{
    content?: unknown;
    metadata?: unknown;
    title: string;
    values: Array<{
      propertyName: string;
      value: unknown;
    }>;
  }>;
};
export type UpdatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  configuration?: ConfigurationChange[];
  name?: string;
  type?: string;
  visible?: boolean;
  width?: number | null;
};
export type DeletePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
};
export type DuplicatePropertyInput = {
  databaseId: string;
  databasePropertyId: string;
  includeValues?: boolean;
};

export type AddDatabasePropertyInput = AddPropertyInput;
export type AddDatabasePropertyResult = DatabasePropertyEntity;
export function addDatabaseProperty(
  context: ClientOperationContext,
  input: AddDatabasePropertyInput,
): Promise<AddDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        config,
        databaseId,
        name,
        position,
        type,
        onOptimistic,
      }: AddDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const commandId = crypto.randomUUID();
        const saving = controller.execute(
          buildPropertyCreate(scope, controller.bootstrap(scope.hostDatabaseId)?.properties ?? [], {
            config,
            name,
            position,
            type,
          }),
          { commandId },
        );
        const preview = controller
          .getSnapshot()
          .find((item) => item.id === commandId)
          ?.metadataEffects?.find((effect) => effect.kind === "property" && effect.insert)?.insert;
        if (preview && "property" in preview) onOptimistic?.(preview);
        const ack = await saving;
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type ApplyDatabaseTemplateResult = {
  dataSource: import("../core/entities").DataSourceEntity;
};
export function applyDatabaseTemplate(
  context: ClientOperationContext,
  input: ApplyDatabaseTemplateInput,
): Promise<ApplyDatabaseTemplateResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId, hostDatabaseId, ...input }: ApplyDatabaseTemplateInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          controller.sessionId,
          databaseId,
          hostDatabaseId,
        );
        const ack = await controller.execute(buildTemplateApply(scope, input));
        const result = ack.result as {
          dataSource: import("../core/entities").DataSourceEntity;
        };
        return result;
      },
    });
  });
}

export type UpdateDatabasePropertyInput = UpdatePropertyInput;
export type UpdateDatabasePropertyResult = DatabasePropertyEntity;
export function updateDatabaseProperty(
  context: ClientOperationContext,
  input: UpdateDatabasePropertyInput,
): Promise<UpdateDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        databaseId,
        databasePropertyId,
        ...patch
      }: UpdateDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute(
          buildPropertyUpdate(scope, { databasePropertyId, ...patch }),
        );
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type DeleteDatabasePropertyInput = DeletePropertyInput;
export type DeleteDatabasePropertyResult = DatabasePropertyEntity;
export function deleteDatabaseProperty(
  context: ClientOperationContext,
  input: DeleteDatabasePropertyInput,
): Promise<DeleteDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId, databasePropertyId }: DeleteDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute(
          buildPropertyState(scope, databasePropertyId, "property.archive"),
        );
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}

export type DuplicateDatabasePropertyInput = DuplicatePropertyInput;
export type DuplicateDatabasePropertyResult = DatabasePropertyEntity;
export function duplicateDatabaseProperty(
  context: ClientOperationContext,
  input: DuplicateDatabasePropertyInput,
): Promise<DuplicateDatabasePropertyResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({
        databaseId,
        databasePropertyId,
        includeValues = false,
      }: DuplicateDatabasePropertyInput) => {
        const scope = resolveDataSourceCommandScope(queryClient, controller.sessionId, databaseId);
        const ack = await controller.execute(
          buildPropertyDuplicate(scope, { databasePropertyId, includeValues }),
        );
        return ack.result as DatabasePropertyEntity;
      },
    });
  });
}
