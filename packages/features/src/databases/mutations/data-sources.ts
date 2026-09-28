import { useDatabaseController } from "../interactions/react";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { type UpdateDatabaseInput } from "./databases";
import { resolveDataSourceCommandScope } from "./scope";
import type { DatabaseViewEntity, DataSourceEntity } from "../core/entities";
type LinkDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
};
type CreateDatabaseDataSourceInput = {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
};
type ReplaceDatabaseViewDataSourceInput = {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
};
export function useUpdateDataSource() {
  const controller = useDatabaseController();
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async ({ databaseId: dataSourceId, ...patch }: UpdateDatabaseInput) => {
      const scope = await resolveDataSourceCommandScope(queryClient, apiFetch, dataSourceId);
      const ack = await controller.execute({
        command: { patch, type: "dataSource.update" },
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId,
      });
      return ack.result as DataSourceEntity;
    },
  });
}
export function useLinkDatabaseDataSource() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({
      config,
      databaseId,
      dataSourceId,
      name,
      type,
    }: LinkDatabaseDataSourceInput) => {
      const result = (
        await controller.execute({
          databaseId,
          command: {
            type: "dataSource.link",
            dataSourceId,
            afterId: null,
            beforeId: null,
            view: {
              name: name?.trim() || "",
              type: type?.trim() || "table",
              config: config ?? null,
            },
          },
        })
      ).result as { dataSource: DataSourceEntity; view: DatabaseViewEntity };
      return result;
    },
  });
}
export function useCreateDatabaseDataSource() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({ databaseId, ...input }: CreateDatabaseDataSourceInput) => {
      const ack = await controller.execute({
        command: {
          config: input.config ?? {},
          name: input.name?.trim() || "New data source",
          type: "dataSource.create",
          viewName: input.viewName?.trim() || "Table",
          viewType: input.viewType?.trim() || "table",
        },
        databaseId,
      });
      return ack.result as {
        dataSource: DataSourceEntity;
        view: DatabaseViewEntity;
      };
    },
  });
}
export function useReplaceDatabaseViewDataSource() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({
      databaseId,
      databaseViewId,
      dataSourceId,
    }: ReplaceDatabaseViewDataSourceInput) => {
      const ack = await controller.execute({
        command: {
          dataSourceId,
          type: "view.setDataSource",
          viewId: databaseViewId,
        },
        databaseId,
      });
      return ack.result as DatabaseViewEntity;
    },
  });
}
export function useUnlinkDatabaseDataSource() {
  const controller = useDatabaseController();
  return useMutation({
    mutationFn: async ({
      databaseId,
      dataSourceId,
    }: Pick<LinkDatabaseDataSourceInput, "databaseId" | "dataSourceId">) => {
      const ack = await controller.execute({
        command: { dataSourceId, type: "dataSource.unlink" },
        databaseId,
      });
      return ack.result as DataSourceEntity;
    },
  });
}
