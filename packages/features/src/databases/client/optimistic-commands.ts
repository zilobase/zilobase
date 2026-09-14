import type {
  DataSourceCommand,
  HostDatabaseCommand,
  PagePropertyValueEntity,
} from "../contracts-v2"
import type { Collection } from "@tanstack/react-db"
import {
  databaseOrderKeyAtPosition,
  databaseOrderKeyBetween,
} from "../order-key"
import type { DatabaseBootstrapCollections } from "./bootstrap-collections"
import type {
  DatabaseClientCommand,
  DatabaseViewScope,
} from "./database-client"
import type {
  DatabaseRecordCollection,
  WindowedDatabaseRecord,
} from "./record-collections"

export function applyOptimisticCommand(options: {
  bootstrapCollections: Iterable<DatabaseBootstrapCollections>
  commandId: string
  input: DatabaseClientCommand
  recordCollections: Iterable<DatabaseRecordCollection>
  shouldOrderByKey(scope: DatabaseViewScope): boolean
}) {
  const command = options.input.command
  if (isHostCommand(command)) {
    applyHostCommand(options, command)
  } else {
    applySourceCommand(options, command)
  }
}

function applyHostCommand(
  options: OptimisticOptions,
  command: HostDatabaseCommand,
) {
  for (const collections of options.bootstrapCollections) {
    if (collections.scope.databaseId !== options.input.databaseId) continue
    switch (command.type) {
      case "database.update":
        updateIfPresent(
          collections.database,
          options.input.databaseId,
          (draft) => Object.assign(draft, command.patch),
        )
        break
      case "dataSource.unlink":
        deleteIfPresent(collections.dataSources, command.dataSourceId)
        break
      case "view.create": {
        const now = new Date().toISOString()
        const position = makeEntitySpace(
          collections.views,
          command.beforeViewId,
          command.afterViewId,
        )
        if (position === null) break
        collections.views.insert({
          config: command.config,
          createdAt: now,
          databaseId: options.input.databaseId,
          dataSourceId: command.dataSourceId,
          id: `optimistic-view-${options.commandId}`,
          name: command.name,
          position,
          type: command.viewType,
          updatedAt: now,
        })
        break
      }
      case "view.update":
        updateIfPresent(collections.views, command.viewId, (draft) => {
          Object.assign(draft, command.patch)
        })
        break
      case "view.move":
        reorderEntities(
          collections.views,
          command.viewId,
          command.beforeViewId,
          command.afterViewId,
        )
        break
      case "view.delete":
        deleteIfPresent(collections.views, command.viewId)
        break
      case "dataSource.link":
        break
    }
  }
}

function applySourceCommand(
  options: OptimisticOptions,
  command: DataSourceCommand,
) {
  const dataSourceId = options.input.dataSourceId
  if (!dataSourceId) return
  if (command.type === "cell.set") {
    for (const resource of matchingRecordCollections(options, dataSourceId)) {
      resource.applyCellOverlay({
        commandId: options.commandId,
        propertyId: command.propertyId,
        rowId: command.rowId,
        value: command.value,
      })
    }
    return
  }

  if (command.type === "row.move") {
    for (const resource of matchingRecordCollections(options, dataSourceId)) {
      moveRecord(resource, command, options.shouldOrderByKey(resource.scope))
    }
    return
  }

  if (command.type === "row.create") {
    for (const resource of matchingRecordCollections(options, dataSourceId)) {
      createRecord(resource, command, options.commandId)
    }
    return
  }

  if (command.type === "row.archive") {
    for (const resource of matchingRecordCollections(options, dataSourceId)) {
      deleteIfPresent(resource.records, command.rowId)
    }
    return
  }

  for (const collections of options.bootstrapCollections) {
    if (collections.scope.databaseId !== options.input.databaseId) continue
    switch (command.type) {
      case "dataSource.update":
        updateIfPresent(collections.dataSources, dataSourceId, (draft) => {
          Object.assign(draft, command.patch)
        })
        break
      case "property.create": {
        const source = collections.dataSources.state.get(dataSourceId)
        if (!source) break
        const now = new Date().toISOString()
        const propertyId = `optimistic-property-${options.commandId}`
        const position = makeEntitySpace(
          collections.properties,
          command.beforePropertyId,
          command.afterPropertyId,
        )
        if (position === null) break
        collections.properties.insert({
          createdAt: now,
          dataSourceId,
          id: `optimistic-link-${options.commandId}`,
          position,
          property: {
            config: command.config,
            createdAt: now,
            id: propertyId,
            name: command.name,
            type: command.propertyType,
            updatedAt: now,
            workspaceId: source.workspaceId,
          },
          propertyId,
          updatedAt: now,
          visible: true,
          width: null,
        })
        break
      }
      case "property.update":
        updateIfPresent(collections.properties, command.propertyId, (draft) => {
          if (command.patch.visible !== undefined) {
            draft.visible = command.patch.visible
          }
          if (command.patch.width !== undefined) {
            draft.width = command.patch.width
          }
          if (command.patch.config !== undefined) {
            draft.property.config = command.patch.config
          }
          if (command.patch.name !== undefined) {
            draft.property.name = command.patch.name
          }
          if (command.patch.type !== undefined) {
            draft.property.type = command.patch.type
          }
        })
        break
      case "property.move":
        reorderEntities(
          collections.properties,
          command.propertyId,
          command.beforePropertyId,
          command.afterPropertyId,
        )
        break
      case "property.archive":
        deleteIfPresent(collections.properties, command.propertyId)
        break
      case "property.restore":
      case "row.restore":
      case "template.create":
      case "template.update":
      case "template.archive":
      case "template.restore":
        break
    }
  }
}

type OptimisticOptions = Parameters<typeof applyOptimisticCommand>[0]

function matchingRecordCollections(
  options: OptimisticOptions,
  dataSourceId: string,
) {
  return [...options.recordCollections].filter((resource) =>
    resource.scope.databaseId === options.input.databaseId &&
    resource.scope.dataSourceId === dataSourceId)
}

function moveRecord(
  resource: DatabaseRecordCollection,
  command: Extract<DataSourceCommand, { type: "row.move" }>,
  orderByKey: boolean,
) {
  const moving = resource.records.state.get(command.rowId)
  if (!moving) return
  const rows = [...resource.records.state.values()]
    .sort((left, right) => left.__windowIndex - right.__windowIndex)
    .filter(({ id }) => id !== command.rowId)
  const index = resolveAnchorIndex(
    rows.map(({ id }) => id),
    command.beforeRowId,
    command.afterRowId,
  )
  if (index === null) return
  rows.splice(index, 0, moving)
  const midpoint = orderByKey
    ? databaseOrderKeyBetween(
        rows[index - 1]?.orderKey ?? null,
        rows[index + 1]?.orderKey ?? null,
      )
    : moving.orderKey

  for (const [position, row] of rows.entries()) {
    updateIfPresent(resource.records, row.id, (draft) => {
      draft.__windowIndex = position
      if (row.id === command.rowId && orderByKey) {
        draft.orderKey = midpoint ?? databaseOrderKeyAtPosition(position)
      } else if (orderByKey && midpoint === null) {
        draft.orderKey = databaseOrderKeyAtPosition(position)
      }
      if (row.id === command.rowId && command.group) {
        draft.valuesByPropertyId[command.group.propertyId] = optimisticValue(
          draft,
          command.group.propertyId,
          command.group.value,
        )
      }
    })
  }
}

function createRecord(
  resource: DatabaseRecordCollection,
  command: Extract<DataSourceCommand, { type: "row.create" }>,
  commandId: string,
) {
  const rows = [...resource.records.state.values()]
    .sort((left, right) => left.__windowIndex - right.__windowIndex)
  const index = resolveAnchorIndex(
    rows.map(({ id }) => id),
    command.beforeRowId,
    command.afterRowId,
  )
  if (index === null) return
  const now = new Date().toISOString()
  const pageId = command.pageId ?? `optimistic-page-${commandId}`
  const orderKey = databaseOrderKeyBetween(
    rows[index - 1]?.orderKey ?? null,
    rows[index]?.orderKey ?? null,
  ) ?? databaseOrderKeyAtPosition(index)
  const optimistic: WindowedDatabaseRecord = {
    __windowIndex: index,
    createdAt: now,
    dataSourceId: resource.scope.dataSourceId,
    id: `optimistic-row-${commandId}`,
    orderKey,
    page: {
      createdAt: now,
      deletedAt: null,
      hasContent: false,
      id: pageId,
      metadata: {},
      name: command.title,
      updatedAt: now,
    },
    pageId,
    parentRowId: command.parentRowId,
    updatedAt: now,
    valuesByPropertyId: Object.fromEntries(
      Object.entries(command.valuesByPropertyId ?? {}).map(
        ([propertyId, value]) => [
          propertyId,
          optimisticValue({ pageId, valuesByPropertyId: {} }, propertyId, value),
        ],
      ),
    ),
  }
  resource.records.insert(optimistic)
  for (const row of rows.slice(index)) {
    updateIfPresent(resource.records, row.id, (draft) => {
      draft.__windowIndex += 1
    })
  }
}

function optimisticValue(
  record: Pick<WindowedDatabaseRecord, "pageId" | "valuesByPropertyId">,
  propertyId: string,
  value: unknown,
): PagePropertyValueEntity {
  const current = record.valuesByPropertyId[propertyId]
  const now = new Date().toISOString()
  return {
    createdAt: current?.createdAt ?? now,
    id: current?.id ?? crypto.randomUUID(),
    pageId: record.pageId,
    propertyId,
    updatedAt: now,
    value,
  }
}

function resolveAnchorIndex(
  ids: string[],
  beforeId: string | null,
  afterId: string | null,
) {
  const before = beforeId ? ids.indexOf(beforeId) : -1
  const after = afterId ? ids.indexOf(afterId) : -1
  if (before >= 0 && after >= 0) return after < before ? after + 1 : null
  if (before >= 0) return before
  if (after >= 0) return after + 1
  return beforeId || afterId ? null : ids.length
}

function reorderEntities<
  TEntity extends { id: string; position: number },
>(
  collection: Collection<TEntity, string>,
  movingId: string,
  beforeId: string | null,
  afterId: string | null,
) {
  const moving = collection.state.get(movingId)
  if (!moving) return
  const entities = [...collection.state.values()]
    .sort((left, right) => left.position - right.position)
    .filter(({ id }) => id !== movingId)
  const index = resolveAnchorIndex(
    entities.map(({ id }) => id),
    beforeId,
    afterId,
  )
  if (index === null) return
  entities.splice(index, 0, moving)
  for (const [position, entity] of entities.entries()) {
    updateIfPresent(collection, entity.id, (draft) => {
      draft.position = position
    })
  }
}

function makeEntitySpace<TEntity extends { id: string; position: number }>(
  collection: Collection<TEntity, string>,
  beforeId: string | null,
  afterId: string | null,
) {
  const entities = [...collection.state.values()]
    .sort((left, right) => left.position - right.position)
  const index = resolveAnchorIndex(
    entities.map(({ id }) => id),
    beforeId,
    afterId,
  )
  if (index === null) return null
  for (const entity of entities.slice(index)) {
    updateIfPresent(collection, entity.id, (draft) => {
      draft.position += 1
    })
  }
  return index
}

function updateIfPresent<TEntity extends { id: string }>(
  collection: Collection<TEntity, string>,
  id: string,
  update: (draft: TEntity) => void,
) {
  if (collection.state.has(id)) collection.update(id, update as never)
}

function deleteIfPresent<TEntity extends { id: string }>(
  collection: Collection<TEntity, string>,
  id: string,
) {
  if (collection.state.has(id)) collection.delete(id)
}

function isHostCommand(
  command: HostDatabaseCommand | DataSourceCommand,
): command is HostDatabaseCommand {
  return command.type === "database.update" ||
    command.type === "dataSource.link" ||
    command.type === "dataSource.unlink" ||
    command.type.startsWith("view.")
}
