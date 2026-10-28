import assert from "node:assert/strict";
import test from "node:test";

import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import type { ApiFetcher } from "../../shared/api-fetcher";
import type {
  DatabaseCommandRequest,
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseViewEntity,
  DataSourceEntity,
} from "../core/entities";
import {
  useAddDatabaseRow,
  useApplyDatabaseTemplate,
  useArchiveDatabaseRow,
  useArchiveDatabaseTemplate,
  useChangeDatabaseRow,
  useCreateDatabaseDataSource,
  useCreateDatabaseTemplate,
  useDeleteDatabaseView,
  useDuplicateDatabaseProperty,
  useReplaceDatabaseViewDataSource,
  useRestoreDatabaseRow,
  useRestoreDatabaseTemplate,
  useUnlinkDatabaseDataSource,
  useUpdateDatabasePropertyValue,
  useUpdateDatabaseTemplate,
} from "../react";
import { createTestDatabasePayload, setTestDatabaseClientState } from "./test-helpers";

/*
 * Characterization of the exact command bodies each client operation sends.
 * Shared command builders and planners must keep these bodies byte-identical.
 */

const now = "2026-09-08T00:00:00.000Z";
const source: DataSourceEntity = {
  config: {},
  configVersion: 1,
  createdAt: now,
  id: "data-source-1",
  linkedAt: now,
  name: "Projects",
  parentDatabaseId: "database-1",
  position: 0,
  updatedAt: now,
  version: 1,
  workspaceId: "org-1",
};
const view: DatabaseViewEntity = {
  config: {},
  createdAt: now,
  databaseId: "database-1",
  dataSourceId: "data-source-1",
  id: "view-table",
  name: "Table",
  position: 0,
  type: "table",
  updatedAt: now,
};
const property: DatabasePropertyEntity = {
  createdAt: now,
  dataSourceId: "data-source-1",
  id: "column-copy",
  position: 2,
  property: {
    config: {},
    createdAt: now,
    id: "property-copy",
    name: "Status copy",
    type: "status",
    updatedAt: now,
    workspaceId: "org-1",
  },
  propertyId: "property-copy",
  updatedAt: now,
  visible: true,
  width: null,
};
const record: DatabaseRecordEntity = {
  createdAt: now,
  dataSourceId: "data-source-1",
  id: "row-1",
  orderKey: "1024.0000000000",
  page: {
    createdAt: now,
    deletedAt: null,
    hasContent: false,
    id: "page-1",
    metadata: {},
    name: "Alpha",
    updatedAt: now,
  },
  pageId: "page-1",
  parentRowId: null,
  updatedAt: now,
  valuesByPropertyId: {},
};

type Sent = { path: string; command: DatabaseCommandRequest["command"] };

function commandApi(sent: Sent[]): ApiFetcher {
  let version = 0;
  return async <T>(path: string, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest;
    assert.equal(request.protocolVersion, 2);
    sent.push({ path, command: request.command });
    version += 1;
    const type = request.command.type;
    const scopedSource = path.includes("/data-sources/") ? "data-source-1" : null;
    const result =
      type === "dataSource.create"
        ? { dataSource: source, view }
        : type === "dataSource.unlink"
          ? source
          : type === "view.setDataSource"
            ? view
            : type === "view.delete"
              ? { viewId: "view-table" }
              : type === "property.duplicate"
                ? property
                : type === "template.apply"
                  ? { dataSource: source }
                  : type.startsWith("template.")
                    ? { archivedAt: null, id: "template-1", name: "Default", template: {} }
                    : record;
    const areas = type.startsWith("row.")
      ? ["records"]
      : type.startsWith("view.")
        ? ["views"]
        : type.startsWith("property.")
          ? ["properties"]
          : ["dataSources"];
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas,
        changes: type.startsWith("row.")
          ? { records: [record], sourceVersions: { "data-source-1": version } }
          : {},
        commandId: request.commandId,
        committedAt: now,
        databaseId: "database-1",
        dataSourceId: scopedSource,
        eventId: `event-${version}`,
        protocolVersion: 2,
        type: "database.mutation",
        version,
      },
      result,
      sourceVersions: scopedSource ? { "data-source-1": version } : {},
    } as T;
  };
}

async function run<T extends { mutateAsync: (input: never) => Promise<unknown> }>(
  useHook: () => T,
  input: Parameters<T["mutateAsync"]>[0],
) {
  const sent: Sent[] = [];
  const runtime = createMutationTestRuntime(useHook, commandApi(sent));
  setTestDatabaseClientState(runtime.queryClient, createTestDatabasePayload());
  try {
    await runtime.mutation.mutateAsync(input as never);
    return sent;
  } finally {
    runtime.queryClient.clear();
  }
}

const hostPath = "/databases/database-1/commands";
const sourcePath = "/databases/database-1/data-sources/data-source-1/commands";

test("data source creation, replacement and unlinking send host commands", async () => {
  assert.deepEqual(await run(useCreateDatabaseDataSource, { databaseId: "database-1" }), [
    {
      path: hostPath,
      command: {
        config: {},
        name: "New data source",
        type: "dataSource.create",
        viewName: "Table",
        viewType: "table",
      },
    },
  ]);
  assert.deepEqual(
    await run(useCreateDatabaseDataSource, {
      config: { emoji: "x" },
      databaseId: "database-1",
      name: " Tasks ",
      viewName: " Board ",
      viewType: " kanban ",
    }),
    [
      {
        path: hostPath,
        command: {
          config: { emoji: "x" },
          name: "Tasks",
          type: "dataSource.create",
          viewName: "Board",
          viewType: "kanban",
        },
      },
    ],
  );
  assert.deepEqual(
    await run(useReplaceDatabaseViewDataSource, {
      databaseId: "database-1",
      databaseViewId: "view-table",
      dataSourceId: "data-source-1",
    }),
    [
      {
        path: hostPath,
        command: {
          dataSourceId: "data-source-1",
          type: "view.setDataSource",
          viewId: "view-table",
        },
      },
    ],
  );
  assert.deepEqual(
    await run(useUnlinkDatabaseDataSource, {
      databaseId: "database-1",
      dataSourceId: "data-source-1",
    }),
    [{ path: hostPath, command: { dataSourceId: "data-source-1", type: "dataSource.unlink" } }],
  );
});

test("view deletion sends a host command", async () => {
  assert.deepEqual(
    await run(useDeleteDatabaseView, { databaseId: "database-1", databaseViewId: "view-table" }),
    [{ path: hostPath, command: { type: "view.delete", viewId: "view-table" } }],
  );
});

test("property duplication and template application send source commands", async () => {
  assert.deepEqual(
    await run(useDuplicateDatabaseProperty, {
      databaseId: "data-source-1",
      databasePropertyId: "column-status",
    }),
    [
      {
        path: sourcePath,
        command: { includeValues: false, propertyId: "column-status", type: "property.duplicate" },
      },
    ],
  );
  assert.deepEqual(
    await run(useApplyDatabaseTemplate, {
      config: { setupDismissed: true },
      databaseId: "data-source-1",
      hostDatabaseId: "database-1",
      name: "Tasks",
      properties: [{ name: "Due", type: "date" }],
      rows: [{ title: "First", values: [{ propertyName: "Due", value: "2026-09-09" }] }],
    }),
    [
      {
        path: sourcePath,
        command: {
          config: { setupDismissed: true },
          name: "Tasks",
          properties: [{ name: "Due", type: "date" }],
          rows: [{ title: "First", values: [{ propertyName: "Due", value: "2026-09-09" }] }],
          type: "template.apply",
        },
      },
    ],
  );
});

test("stored template operations send their exact source command bodies", async () => {
  assert.deepEqual(
    [
      ...(await run(useCreateDatabaseTemplate, {
        databaseId: "data-source-1",
        name: "Default",
        template: { status: "Todo" },
      })),
      ...(await run(useUpdateDatabaseTemplate, {
        databaseId: "data-source-1",
        patch: { status: "Done" },
        templateId: "template-1",
      })),
      ...(await run(useArchiveDatabaseTemplate, {
        databaseId: "data-source-1",
        templateId: "template-1",
      })),
      ...(await run(useRestoreDatabaseTemplate, {
        databaseId: "data-source-1",
        templateId: "template-1",
      })),
    ],
    [
      {
        path: sourcePath,
        command: { name: "Default", template: { status: "Todo" }, type: "template.create" },
      },
      {
        path: sourcePath,
        command: { patch: { status: "Done" }, templateId: "template-1", type: "template.update" },
      },
      { path: sourcePath, command: { templateId: "template-1", type: "template.archive" } },
      { path: sourcePath, command: { templateId: "template-1", type: "template.restore" } },
    ],
  );
});

test("row operations send their exact source command bodies", async () => {
  assert.deepEqual(
    await run(useAddDatabaseRow, { databaseId: "data-source-1", position: 1, title: "Middle" }),
    [
      {
        path: sourcePath,
        command: {
          afterRowId: "row-1",
          beforeRowId: "row-2",
          parentRowId: null,
          title: "Middle",
          type: "row.place",
        },
      },
    ],
  );
  assert.deepEqual(
    await run(useUpdateDatabasePropertyValue, {
      databaseId: "data-source-1",
      propertyId: "property-status",
      rowId: "row-1",
      value: "Done",
    }),
    [
      {
        path: sourcePath,
        command: {
          rowId: "row-1",
          type: "row.change",
          valuesByPropertyId: { "property-status": "Done" },
        },
      },
    ],
  );
  assert.deepEqual(
    await run(() => useChangeDatabaseRow({ hostDatabaseId: "database-1" }), {
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      rowId: "row-1",
      title: "Renamed",
    }),
    [{ path: sourcePath, command: { rowId: "row-1", title: "Renamed", type: "row.change" } }],
  );
  assert.deepEqual(
    await run(useArchiveDatabaseRow, { databaseId: "data-source-1", rowId: "row-1" }),
    [{ path: sourcePath, command: { rowId: "row-1", type: "row.archive" } }],
  );
  assert.deepEqual(
    await run(useRestoreDatabaseRow, { databaseId: "data-source-1", rowId: "row-1" }),
    [{ path: sourcePath, command: { rowId: "row-1", type: "row.restore" } }],
  );
});
