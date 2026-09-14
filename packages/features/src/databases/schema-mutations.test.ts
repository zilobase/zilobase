import assert from "node:assert/strict"
import test from "node:test"

import { createMutationTestRuntime } from "../shared/mutation-runtime.test"
import type { DatabaseCommandRequest } from "./contracts-v2"
import {
  useAddDatabaseProperty,
  useArchiveDatabaseTemplate,
  useCreateDatabaseTemplate,
  useDeleteDatabaseProperty,
  useLinkDatabaseDataSource,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabaseTemplate,
  useUpdateDataSource,
} from "./mutation-hooks"
import { databaseQueryKey } from "./queries"
import { createTestDatabasePayload } from "./test-helpers"

const now = "2026-09-08T00:00:00.000Z"
const host = {
  accessLevel: "edit" as const,
  config: {},
  createdAt: now,
  id: "database-1",
  name: "Projects",
  pageId: "page-root",
  updatedAt: now,
  version: 1,
  workspaceId: "org-1",
}
const source = {
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
}
const view = {
  config: {},
  createdAt: now,
  databaseId: "database-1",
  dataSourceId: "data-source-1",
  id: "view-2",
  name: "Board",
  position: 1,
  type: "kanban",
  updatedAt: now,
}
const property = {
  createdAt: now,
  dataSourceId: "data-source-1",
  id: "column-created",
  position: 1,
  property: {
    config: {},
    createdAt: now,
    id: "property-created",
    name: "Created",
    type: "date",
    updatedAt: now,
    workspaceId: "org-1",
  },
  propertyId: "property-created",
  updatedAt: now,
  visible: true,
  width: null,
}

function commandApi(sent: Array<{ path: string; request: DatabaseCommandRequest }>) {
  let version = 0
  return async <T>(path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as DatabaseCommandRequest
    sent.push({ path, request })
    version += 1
    const command = request.command
    const result = command.type === "database.update"
      ? host
      : command.type === "view.create"
        ? view
        : command.type.startsWith("property.")
          ? property
          : command.type.startsWith("template.")
            ? { archivedAt: null, id: "template-1", name: "Default", template: {} }
            : source
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas: [command.type.startsWith("view.") ? "views" : "dataSources"],
        changes: {},
        commandId: request.commandId,
        committedAt: now,
        databaseId: "database-1",
        dataSourceId: command.type === "database.update" ? null : "data-source-1",
        eventId: `event-${version}`,
        protocolVersion: 2,
        type: "database.mutation",
        version,
      },
      result,
    } as T
  }
}

test("database and data-source metadata hooks execute scoped v2 commands", async () => {
  const sent: Array<{ path: string; request: DatabaseCommandRequest }> = []
  const databaseRuntime = createMutationTestRuntime(useUpdateDatabase, commandApi(sent))
  const sourceRuntime = createMutationTestRuntime(useUpdateDataSource, commandApi(sent))
  sourceRuntime.queryClient.setQueryData(
    databaseQueryKey("database-1"),
    createTestDatabasePayload(),
  )
  try {
    await databaseRuntime.mutation.mutateAsync({
      databaseId: "database-1",
      name: "Roadmap",
    })
    await sourceRuntime.mutation.mutateAsync({
      config: { setupDismissed: true },
      databaseId: "data-source-1",
    })
    assert.deepEqual(sent.map(({ path, request }) => [path, request.command]), [
      ["/databases/database-1/commands", {
        patch: { name: "Roadmap" },
        type: "database.update",
      }],
      ["/databases/database-1/data-sources/data-source-1/commands", {
        patch: { config: { setupDismissed: true } },
        type: "dataSource.update",
      }],
    ])
  } finally {
    databaseRuntime.queryClient.clear()
    sourceRuntime.queryClient.clear()
  }
})

test("linking a data source creates its initial view through host commands", async () => {
  const sent: Array<{ path: string; request: DatabaseCommandRequest }> = []
  const { mutation, queryClient } = createMutationTestRuntime(
    useLinkDatabaseDataSource,
    commandApi(sent),
  )
  try {
    const result = await mutation.mutateAsync({
      config: { groupPropertyId: "property-status" },
      databaseId: "database-1",
      dataSourceId: "data-source-1",
      name: "Board",
      type: "kanban",
    })
    assert.equal(result.view.id, "view-2")
    assert.deepEqual(sent.map(({ request }) => request.command.type), [
      "dataSource.link",
      "view.create",
    ])
    assert.ok(sent.every(({ path }) => path === "/databases/database-1/commands"))
  } finally {
    queryClient.clear()
  }
})

test("property hooks use source commands and translate positions to anchors", async () => {
  const sent: Array<{ path: string; request: DatabaseCommandRequest }> = []
  const add = createMutationTestRuntime(useAddDatabaseProperty, commandApi(sent))
  const update = createMutationTestRuntime(useUpdateDatabaseProperty, commandApi(sent))
  const archive = createMutationTestRuntime(useDeleteDatabaseProperty, commandApi(sent))
  for (const runtime of [add, update, archive]) {
    runtime.queryClient.setQueryData(
      databaseQueryKey("database-1"),
      createTestDatabasePayload(),
    )
  }
  try {
    await add.mutation.mutateAsync({
      databaseId: "data-source-1",
      name: "Created",
      position: 1,
      type: "date",
    })
    await update.mutation.mutateAsync({
      databaseId: "data-source-1",
      databasePropertyId: "column-status",
      name: "Stage",
    })
    await archive.mutation.mutateAsync({
      databaseId: "data-source-1",
      databasePropertyId: "column-status",
    })
    assert.deepEqual(sent.map(({ request }) => request.command), [
      {
        afterPropertyId: "column-status",
        beforePropertyId: "column-name",
        config: null,
        name: "Created",
        propertyType: "date",
        type: "property.create",
      },
      {
        patch: { name: "Stage" },
        propertyId: "column-status",
        type: "property.update",
      },
      { propertyId: "column-status", type: "property.archive" },
    ])
  } finally {
    for (const runtime of [add, update, archive]) runtime.queryClient.clear()
  }
})

test("stored template hooks share the structural source lane", async () => {
  const sent: Array<{ path: string; request: DatabaseCommandRequest }> = []
  const create = createMutationTestRuntime(useCreateDatabaseTemplate, commandApi(sent))
  const update = createMutationTestRuntime(useUpdateDatabaseTemplate, commandApi(sent))
  const archive = createMutationTestRuntime(useArchiveDatabaseTemplate, commandApi(sent))
  for (const runtime of [create, update, archive]) {
    runtime.queryClient.setQueryData(
      databaseQueryKey("database-1"),
      createTestDatabasePayload(),
    )
  }
  try {
    await create.mutation.mutateAsync({
      databaseId: "data-source-1",
      name: "Default",
      template: { status: "Todo" },
    })
    await update.mutation.mutateAsync({
      databaseId: "data-source-1",
      patch: { status: "Done" },
      templateId: "template-1",
    })
    await archive.mutation.mutateAsync({
      databaseId: "data-source-1",
      templateId: "template-1",
    })
    assert.deepEqual(sent.map(({ request }) => request.command.type), [
      "template.create",
      "template.update",
      "template.archive",
    ])
  } finally {
    for (const runtime of [create, update, archive]) runtime.queryClient.clear()
  }
})
