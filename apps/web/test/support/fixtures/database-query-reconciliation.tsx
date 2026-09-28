import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZilobaseFeaturesProvider,
  type ZilobaseFeaturesConfig,
} from "../../../../../packages/features/src/shared/context";
import { DbProvider } from "../../../../../packages/features/src/databases/queries/session";
import { useDatabaseBootstrap } from "../../../../../packages/features/src/databases/queries/bootstrap";
import { useDatabaseRecords } from "../../../../../packages/features/src/databases/queries/records";
import { databaseBootstrapQueryKey } from "../../../../../packages/features/src/databases/queries/keys";
import {
  databaseController,
  disposeDatabaseController,
} from "../../../../../packages/features/src/databases/interactions/store";
import { databaseViewQueryHash } from "../../../../../packages/features/src/databases/views/query-hash";
import type { DatabaseBootstrapResponse } from "../../../../../packages/features/src/databases/core/entities";

export function mountQueryReconciliation(container: HTMLElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const now = "2026-09-29T00:00:00.000Z";
  let server: DatabaseBootstrapResponse = {
    database: {
      id: "host",
      name: "Database",
      version: 1,
      workspaceId: "workspace",
      config: {},
      pageId: null,
      accessLevel: "full",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    dataSources: [
      {
        id: "source",
        name: "Source",
        version: 1,
        configVersion: 1,
        config: {},
        position: 0,
        parentDatabaseId: "host",
        workspaceId: "workspace",
        linkedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    properties: [],
    views: ["table", "kanban"].map((id, position) => ({
      id,
      position,
      databaseId: "host",
      dataSourceId: "source",
      name: id,
      type: id,
      config: {},
      createdAt: now,
      updatedAt: now,
    })),
  };
  const key = databaseBootstrapQueryKey("query-test", { databaseId: "host" });
  queryClient.setQueryData(key, server);
  const requests: string[] = [];
  let confirm: (() => void) | undefined;
  const sorts = [{ column: "name", direction: "descending" }];
  const apiFetch = (async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { commandId } = JSON.parse(String(init.body));
      return new Promise((resolve) => {
        confirm = () => {
          server = {
            ...server,
            database: { ...server.database, version: 2 },
            views: server.views.map((view) =>
              view.id === "table" ? { ...view, config: { sorts } } : view,
            ),
          };
          resolve({
            commandId,
            sourceVersions: {},
            result: server.views[0],
            event: {
              actorId: "actor",
              areas: ["views"],
              changes: {},
              commandId,
              committedAt: now,
              databaseId: "host",
              dataSourceId: null,
              eventId: commandId,
              protocolVersion: 2,
              type: "database.mutation",
              version: 2,
            },
          });
        };
      });
    }
    if (path.includes("/bootstrap")) return server;
    requests.push(path);
    const params = new URL(path, "https://test.invalid").searchParams;
    const view = server.views.find(({ id }) => id === params.get("viewId"));
    const queryHash = databaseViewQueryHash(view?.config);
    if (params.get("expectedQueryHash") !== queryHash)
      throw { status: 409, body: { code: "VIEW_QUERY_CHANGED" } };
    return {
      queryHash,
      databaseVersion: server.database.version,
      dataSourceVersion: 1,
      hasMore: false,
      offset: 0,
      records: [],
      snapshot: "snapshot",
      totalCount: 0,
    };
  }) as ZilobaseFeaturesConfig["apiFetch"];
  const controller = databaseController(queryClient, "query-test", apiFetch);
  const output: Record<string, { config: unknown; hash?: string; status: string }> = {};
  function Capture({ viewId }: { viewId: string }) {
    const bootstrap = useDatabaseBootstrap({ databaseId: "host" });
    const records = useDatabaseRecords({ databaseId: "host", dataSourceId: "source", viewId });
    output[viewId] = {
      config: bootstrap.data?.views.find(({ id }) => id === viewId)?.config,
      hash: records.scope?.queryHash,
      status: records.status,
    };
    return null;
  }
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          ZilobaseFeaturesProvider,
          { value: { queryClient, apiFetch, auth: {} as ZilobaseFeaturesConfig["auth"] } },
          createElement(
            DbProvider,
            { queryClient, apiFetch, sessionId: "query-test" },
            createElement(Capture, { viewId: "table" }),
            createElement(Capture, { viewId: "kanban" }),
          ),
        ),
      ),
    ),
  );
  return {
    requests,
    output,
    edit() {
      void controller
        .execute({
          databaseId: "host",
          command: {
            type: "view.update",
            viewId: "table",
            patch: { configuration: [{ operation: "set", path: ["sorts"], value: sorts }] },
          },
        })
        .catch(() => undefined);
    },
    confirm: () => confirm!(),
    rawConfig: () => queryClient.getQueryData<DatabaseBootstrapResponse>(key)?.views[0]?.config,
    close() {
      flushSync(() => root.unmount());
      disposeDatabaseController(queryClient, "query-test");
      queryClient.clear();
    },
  };
}
