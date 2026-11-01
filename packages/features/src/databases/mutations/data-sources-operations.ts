import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import type { DatabaseViewEntity, DataSourceEntity } from "../core/entities";
import {
  buildDataSourceCreate,
  buildDataSourceLink,
  buildDataSourceUnlink,
  buildDataSourceUpdate,
  buildViewSetDataSource,
} from "./command-builders";
import { type UpdateDatabaseInput } from "./databases-operations";
import { resolveDataSourceCommandScope } from "./scope";
export type LinkDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
export type CreateDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
};
export type ReplaceDatabaseViewDataSourceInput = {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
};

export type UpdateDataSourceInput = UpdateDatabaseInput;
export type UpdateDataSourceResult = DataSourceEntity;
export function updateDataSource(
  context: ClientOperationContext,
  input: UpdateDataSourceInput,
): Promise<UpdateDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    const { queryClient } = context;
    return clientMutation({
      mutationFn: async ({ databaseId: dataSourceId, ...patch }: UpdateDataSourceInput) => {
        const scope = resolveDataSourceCommandScope(
          queryClient,
          controller.sessionId,
          dataSourceId,
        );
        const ack = await controller.execute(buildDataSourceUpdate(scope, patch));
        return ack.result as DataSourceEntity;
      },
    });
  });
}

export type LinkDatabaseDataSourceResult = {
  dataSource: DataSourceEntity;
  view: DatabaseViewEntity;
};
export function linkDatabaseDataSource(
  context: ClientOperationContext,
  input: LinkDatabaseDataSourceInput,
): Promise<LinkDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: LinkDatabaseDataSourceInput) =>
        (await controller.execute(buildDataSourceLink(input))).result as {
          dataSource: DataSourceEntity;
          view: DatabaseViewEntity;
        },
    });
  });
}

export type CreateDatabaseDataSourceResult = {
  dataSource: DataSourceEntity;
  view: DatabaseViewEntity;
};
export function createDatabaseDataSource(
  context: ClientOperationContext,
  input: CreateDatabaseDataSourceInput,
): Promise<CreateDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: CreateDatabaseDataSourceInput) => {
        const ack = await controller.execute(buildDataSourceCreate(input));
        return ack.result as {
          dataSource: DataSourceEntity;
          view: DatabaseViewEntity;
        };
      },
    });
  });
}

export type ReplaceDatabaseViewDataSourceResult = DatabaseViewEntity;
export function replaceDatabaseViewDataSource(
  context: ClientOperationContext,
  input: ReplaceDatabaseViewDataSourceInput,
): Promise<ReplaceDatabaseViewDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: ReplaceDatabaseViewDataSourceInput) => {
        const ack = await controller.execute(buildViewSetDataSource(input));
        return ack.result as DatabaseViewEntity;
      },
    });
  });
}

export type UnlinkDatabaseDataSourceInput = Pick<
  LinkDatabaseDataSourceInput,
  "databaseId" | "dataSourceId"
>;
export type UnlinkDatabaseDataSourceResult = DataSourceEntity;
export function unlinkDatabaseDataSource(
  context: ClientOperationContext,
  input: UnlinkDatabaseDataSourceInput,
): Promise<UnlinkDatabaseDataSourceResult> {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async (input: UnlinkDatabaseDataSourceInput) => {
        const ack = await controller.execute(buildDataSourceUnlink(input));
        return ack.result as DataSourceEntity;
      },
    });
  });
}
