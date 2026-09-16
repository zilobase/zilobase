import { z } from "zod"

const entityIdSchema = z.string().trim().min(1).max(128)
const timestampSchema = z.string().datetime({ offset: true })
const versionSchema = z.number().int().nonnegative()
const positiveVersionSchema = z.number().int().positive()
const nullableEntityIdSchema = entityIdSchema.nullable()

export const databaseInitialPageSizeSchema = z.union([
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(100),
])
export type DatabaseInitialPageSize = z.infer<
  typeof databaseInitialPageSizeSchema
>

export const databaseHostEntitySchema = z
  .object({
    accessLevel: z.enum(["view", "edit", "full"]).nullable(),
    config: z.unknown(),
    createdAt: timestampSchema,
    id: entityIdSchema,
    name: z.string(),
    pageId: nullableEntityIdSchema,
    updatedAt: timestampSchema,
    version: versionSchema,
    workspaceId: entityIdSchema,
  })
  .strict()
export type DatabaseHostEntity = z.infer<typeof databaseHostEntitySchema>

export const dataSourceEntitySchema = z
  .object({
    config: z.unknown(),
    configVersion: versionSchema,
    createdAt: timestampSchema,
    id: entityIdSchema,
    linkedAt: timestampSchema.nullable(),
    name: z.string(),
    parentDatabaseId: entityIdSchema,
    position: z.number().int().nonnegative(),
    updatedAt: timestampSchema,
    version: versionSchema,
    workspaceId: entityIdSchema,
  })
  .strict()
export type DataSourceEntity = z.infer<typeof dataSourceEntitySchema>

/**
 * Source-owned fields carried by the source realtime stream.
 *
 * Link placement (`linkedAt` and `position`) belongs to the host database and
 * intentionally is not part of this shape.
 */
export const dataSourcePatchSchema = z
  .object({
    config: z.unknown(),
    configVersion: versionSchema,
    createdAt: timestampSchema,
    id: entityIdSchema,
    name: z.string(),
    parentDatabaseId: entityIdSchema,
    updatedAt: timestampSchema,
    version: versionSchema,
    workspaceId: entityIdSchema,
  })
  .strict()
export type DataSourcePatch = z.infer<typeof dataSourcePatchSchema>

export const databaseViewEntitySchema = z
  .object({
    config: z.unknown(),
    createdAt: timestampSchema,
    databaseId: entityIdSchema,
    dataSourceId: entityIdSchema,
    id: entityIdSchema,
    name: z.string(),
    position: z.number().int().nonnegative(),
    type: z.string().trim().min(1).max(64),
    updatedAt: timestampSchema,
  })
  .strict()
export type DatabaseViewEntity = z.infer<typeof databaseViewEntitySchema>

export const pagePropertyEntitySchema = z
  .object({
    config: z.unknown(),
    createdAt: timestampSchema,
    id: entityIdSchema,
    name: z.string(),
    type: z.string().trim().min(1).max(64),
    updatedAt: timestampSchema,
    workspaceId: entityIdSchema,
  })
  .strict()

export const databasePropertyEntitySchema = z
  .object({
    createdAt: timestampSchema,
    dataSourceId: entityIdSchema,
    id: entityIdSchema,
    position: z.number().int().nonnegative(),
    property: pagePropertyEntitySchema,
    propertyId: entityIdSchema,
    updatedAt: timestampSchema,
    visible: z.boolean(),
    width: z.number().finite().positive().nullable(),
  })
  .strict()
export type DatabasePropertyEntity = z.infer<
  typeof databasePropertyEntitySchema
>

export const pagePropertyValueEntitySchema = z
  .object({
    createdAt: timestampSchema,
    id: entityIdSchema,
    pageId: entityIdSchema,
    propertyId: entityIdSchema,
    updatedAt: timestampSchema,
    value: z.unknown(),
  })
  .strict()
export type PagePropertyValueEntity = z.infer<
  typeof pagePropertyValueEntitySchema
>

export const databaseOrderKeySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,19})(?:\.\d{1,10})?$/)

export const databaseRecordEntitySchema = z
  .object({
    createdAt: timestampSchema,
    dataSourceId: entityIdSchema,
    id: entityIdSchema,
    orderKey: databaseOrderKeySchema,
    page: z
      .object({
        createdAt: timestampSchema,
        deletedAt: timestampSchema.nullable(),
        hasContent: z.boolean(),
        id: entityIdSchema,
        metadata: z.unknown(),
        name: z.string(),
        updatedAt: timestampSchema,
      })
      .strict(),
    pageId: entityIdSchema,
    parentRowId: nullableEntityIdSchema,
    updatedAt: timestampSchema,
    valuesByPropertyId: z.record(entityIdSchema, pagePropertyValueEntitySchema),
  })
  .strict()
export type DatabaseRecordEntity = z.infer<typeof databaseRecordEntitySchema>

export const databaseBootstrapResponseSchema = z
  .object({
    database: databaseHostEntitySchema,
    dataSources: z.array(dataSourceEntitySchema),
    properties: z.array(databasePropertyEntitySchema),
    views: z.array(databaseViewEntitySchema),
  })
  .strict()
export type DatabaseBootstrapResponse = z.infer<
  typeof databaseBootstrapResponseSchema
>

export const databaseRecordWindowResponseSchema = z
  .object({
    databaseVersion: versionSchema,
    dataSourceVersion: versionSchema,
    hasMore: z.boolean(),
    offset: z.number().int().nonnegative(),
    records: z.array(databaseRecordEntitySchema),
    snapshot: z.string().trim().min(1).max(2_048),
    totalCount: z.number().int().nonnegative(),
  })
  .strict()
export type DatabaseRecordWindowResponse = z.infer<
  typeof databaseRecordWindowResponseSchema
>

const neighborFields = {
  afterId: nullableEntityIdSchema,
  beforeId: nullableEntityIdSchema,
}

const databaseUpdateCommandSchema = z
  .object({
    patch: z
      .object({
        config: z.unknown().optional(),
        name: z.string().optional(),
      })
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, "Patch is empty"),
    type: z.literal("database.update"),
  })
  .strict()

const dataSourceLinkCommandSchema = z
  .object({
    dataSourceId: entityIdSchema,
    ...neighborFields,
    type: z.literal("dataSource.link"),
  })
  .strict()

const dataSourceCreateCommandSchema = z
  .object({
    config: z.unknown(),
    name: z.string(),
    type: z.literal("dataSource.create"),
    viewName: z.string(),
    viewType: z.string().trim().min(1).max(64),
  })
  .strict()

const dataSourceUnlinkCommandSchema = z
  .object({
    dataSourceId: entityIdSchema,
    type: z.literal("dataSource.unlink"),
  })
  .strict()

const viewCreateCommandSchema = z
  .object({
    afterViewId: nullableEntityIdSchema,
    beforeViewId: nullableEntityIdSchema,
    config: z.unknown(),
    dataSourceId: entityIdSchema,
    name: z.string(),
    type: z.literal("view.create"),
    viewType: z.string().trim().min(1).max(64),
  })
  .strict()

const viewUpdateCommandSchema = z
  .object({
    patch: z
      .object({
        config: z.unknown().optional(),
        name: z.string().optional(),
        type: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, "Patch is empty"),
    type: z.literal("view.update"),
    viewId: entityIdSchema,
  })
  .strict()

const viewMoveCommandSchema = z
  .object({
    afterViewId: nullableEntityIdSchema,
    beforeViewId: nullableEntityIdSchema,
    type: z.literal("view.move"),
    viewId: entityIdSchema,
  })
  .strict()

const viewDeleteCommandSchema = z
  .object({
    type: z.literal("view.delete"),
    viewId: entityIdSchema,
  })
  .strict()

const viewSetDataSourceCommandSchema = z
  .object({
    dataSourceId: entityIdSchema,
    type: z.literal("view.setDataSource"),
    viewId: entityIdSchema,
  })
  .strict()

export const hostDatabaseCommandSchema = z.discriminatedUnion("type", [
  databaseUpdateCommandSchema,
  dataSourceCreateCommandSchema,
  dataSourceLinkCommandSchema,
  dataSourceUnlinkCommandSchema,
  viewCreateCommandSchema,
  viewUpdateCommandSchema,
  viewMoveCommandSchema,
  viewDeleteCommandSchema,
  viewSetDataSourceCommandSchema,
])
export type HostDatabaseCommand = z.infer<typeof hostDatabaseCommandSchema>

const dataSourceUpdateCommandSchema = z
  .object({
    patch: z
      .object({
        config: z.unknown().optional(),
        name: z.string().optional(),
      })
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, "Patch is empty"),
    type: z.literal("dataSource.update"),
  })
  .strict()

const propertyCreateCommandSchema = z
  .object({
    afterPropertyId: nullableEntityIdSchema,
    beforePropertyId: nullableEntityIdSchema,
    config: z.unknown(),
    name: z.string(),
    propertyType: z.string().trim().min(1).max(64),
    type: z.literal("property.create"),
  })
  .strict()

const propertyUpdateCommandSchema = z
  .object({
    patch: z
      .object({
        config: z.unknown().optional(),
        name: z.string().optional(),
        type: z.string().trim().min(1).max(64).optional(),
        visible: z.boolean().optional(),
        width: z.number().finite().positive().nullable().optional(),
      })
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, "Patch is empty"),
    propertyId: entityIdSchema,
    type: z.literal("property.update"),
  })
  .strict()

const propertyMoveCommandSchema = z
  .object({
    afterPropertyId: nullableEntityIdSchema,
    beforePropertyId: nullableEntityIdSchema,
    propertyId: entityIdSchema,
    type: z.literal("property.move"),
  })
  .strict()

const propertyStateCommandSchema = z.discriminatedUnion("type", [
  z.object({ propertyId: entityIdSchema, type: z.literal("property.archive") }).strict(),
  z.object({ propertyId: entityIdSchema, type: z.literal("property.restore") }).strict(),
])

const propertyDuplicateCommandSchema = z
  .object({
    includeValues: z.boolean(),
    propertyId: entityIdSchema,
    type: z.literal("property.duplicate"),
  })
  .strict()

const templateWriteCommandSchema = z.discriminatedUnion("type", [
  z.object({ name: z.string(), template: z.unknown(), type: z.literal("template.create") }).strict(),
  z.object({ patch: z.unknown(), templateId: entityIdSchema, type: z.literal("template.update") }).strict(),
  z.object({ templateId: entityIdSchema, type: z.literal("template.archive") }).strict(),
  z.object({ templateId: entityIdSchema, type: z.literal("template.restore") }).strict(),
])

const templateApplyCommandSchema = z
  .object({
    config: z.unknown(),
    name: z.string(),
    properties: z.array(z.object({
      config: z.unknown().optional(),
      name: z.string(),
      type: z.string().trim().min(1).max(64),
    }).strict()).max(50),
    rows: z.array(z.object({
      content: z.unknown().optional(),
      metadata: z.unknown().optional(),
      title: z.string(),
      values: z.array(z.object({
        propertyName: z.string(),
        value: z.unknown(),
      }).strict()),
    }).strict()).max(100),
    type: z.literal("template.apply"),
  })
  .strict()

export const moveRowCommandSchema = z
  .object({
    afterRowId: nullableEntityIdSchema,
    beforeRowId: nullableEntityIdSchema,
    group: z
      .object({
        propertyId: entityIdSchema,
        value: z.unknown(),
      })
      .strict()
      .optional(),
    rowId: entityIdSchema,
    type: z.literal("row.move"),
  })
  .strict()
export type MoveRowCommand = z.infer<typeof moveRowCommandSchema>

const rowCreateCommandSchema = z
  .object({
    afterRowId: nullableEntityIdSchema,
    beforeRowId: nullableEntityIdSchema,
    pageId: entityIdSchema.optional(),
    parentRowId: nullableEntityIdSchema,
    title: z.string(),
    type: z.literal("row.create"),
    valuesByPropertyId: z.record(entityIdSchema, z.unknown()).optional(),
  })
  .strict()

const rowStateCommandSchema = z.discriminatedUnion("type", [
  z.object({ rowId: entityIdSchema, type: z.literal("row.archive") }).strict(),
  z.object({ rowId: entityIdSchema, type: z.literal("row.restore") }).strict(),
])

const cellSetCommandSchema = z
  .object({
    propertyId: entityIdSchema,
    rowId: entityIdSchema,
    type: z.literal("cell.set"),
    value: z.unknown(),
  })
  .strict()

export const dataSourceCommandSchema = z.discriminatedUnion("type", [
  dataSourceUpdateCommandSchema,
  propertyCreateCommandSchema,
  propertyUpdateCommandSchema,
  propertyMoveCommandSchema,
  propertyDuplicateCommandSchema,
  ...propertyStateCommandSchema.options,
  ...templateWriteCommandSchema.options,
  templateApplyCommandSchema,
  rowCreateCommandSchema,
  moveRowCommandSchema,
  ...rowStateCommandSchema.options,
  cellSetCommandSchema,
])
export type DataSourceCommand = z.infer<typeof dataSourceCommandSchema>

export const databaseCommandSchema = z.union([
  hostDatabaseCommandSchema,
  dataSourceCommandSchema,
])
export type DatabaseCommand = z.infer<typeof databaseCommandSchema>

export const databaseCommandRequestSchema = z
  .object({
    command: databaseCommandSchema,
    commandId: entityIdSchema,
    protocolVersion: z.literal(2),
  })
  .strict()
type ParsedDatabaseCommandRequest = z.infer<
  typeof databaseCommandRequestSchema
>
export type DatabaseCommandRequest<
  TCommand extends DatabaseCommand = DatabaseCommand,
> = Omit<ParsedDatabaseCommandRequest, "command"> & { command: TCommand }

export const databaseChangedAreaV2Schema = z.enum([
  "databases",
  "dataSources",
  "views",
  "properties",
  "records",
])
export type DatabaseChangedAreaV2 = z.infer<
  typeof databaseChangedAreaV2Schema
>

export const databaseMutationChangesSchema = z
  .object({
    dataSources: z.array(dataSourceEntitySchema).optional(),
    databases: z.array(databaseHostEntitySchema).optional(),
    properties: z.array(databasePropertyEntitySchema).optional(),
    records: z.array(databaseRecordEntitySchema).optional(),
    removedDataSourceIds: z.array(entityIdSchema).optional(),
    removedDatabaseIds: z.array(entityIdSchema).optional(),
    removedPropertyIds: z.array(entityIdSchema).optional(),
    removedRecordIds: z.array(entityIdSchema).optional(),
    removedViewIds: z.array(entityIdSchema).optional(),
    views: z.array(databaseViewEntitySchema).optional(),
  })
  .strict()
export type DatabaseMutationChanges = z.infer<
  typeof databaseMutationChangesSchema
>

export const databaseMutationEventV2Schema = z
  .object({
    actorId: entityIdSchema,
    areas: z.array(databaseChangedAreaV2Schema),
    changes: databaseMutationChangesSchema,
    commandId: entityIdSchema,
    committedAt: timestampSchema,
    databaseId: entityIdSchema,
    dataSourceId: nullableEntityIdSchema,
    eventId: entityIdSchema,
    protocolVersion: z.literal(2),
    requiresReset: z.literal(true).optional(),
    type: z.literal("database.mutation"),
    version: positiveVersionSchema,
  })
  .strict()
export type DatabaseMutationEventV2 = z.infer<
  typeof databaseMutationEventV2Schema
>

export const dataSourceChangedAreaV3Schema = z.enum([
  "source",
  "properties",
  "records",
])
export type DataSourceChangedAreaV3 = z.infer<
  typeof dataSourceChangedAreaV3Schema
>

export const dataSourceMutationChangesV3Schema = z
  .object({
    affectedPropertyIds: z.array(entityIdSchema).optional(),
    properties: z.array(databasePropertyEntitySchema).optional(),
    records: z.array(databaseRecordEntitySchema).optional(),
    removedPropertyIds: z.array(entityIdSchema).optional(),
    removedRecordIds: z.array(entityIdSchema).optional(),
    source: dataSourcePatchSchema.optional(),
  })
  .strict()
export type DataSourceMutationChangesV3 = z.infer<
  typeof dataSourceMutationChangesV3Schema
>

export const dataSourceMutationEventV3Schema = z
  .object({
    actorId: entityIdSchema,
    areas: z.array(dataSourceChangedAreaV3Schema),
    changes: dataSourceMutationChangesV3Schema,
    commandId: entityIdSchema,
    committedAt: timestampSchema,
    eventId: entityIdSchema,
    protocolVersion: z.literal(3),
    requiresReset: z.literal(true).optional(),
    sourceId: entityIdSchema,
    sourceVersion: positiveVersionSchema,
    type: z.literal("database.mutation"),
  })
  .strict()
export type DataSourceMutationEventV3 = z.infer<
  typeof dataSourceMutationEventV3Schema
>

export const databaseMutationFeedResponseSchema = z
  .object({
    events: z.array(databaseMutationEventV2Schema),
    hasMore: z.boolean(),
    latestVersion: versionSchema,
    resetRequired: z.boolean(),
  })
  .strict()
export type DatabaseMutationFeedResponse = z.infer<
  typeof databaseMutationFeedResponseSchema
>

export const dataSourceMutationFeedResponseV3Schema = z
  .object({
    events: z.array(dataSourceMutationEventV3Schema),
    hasMore: z.boolean(),
    latestSourceVersion: versionSchema,
    resetRequired: z.boolean(),
  })
  .strict()
export type DataSourceMutationFeedResponseV3 = z.infer<
  typeof dataSourceMutationFeedResponseV3Schema
>

export const databaseCommandAckSchema = z
  .object({
    commandId: entityIdSchema,
    event: databaseMutationEventV2Schema,
    result: z.unknown(),
  })
  .strict()
type ParsedDatabaseCommandAck = z.infer<typeof databaseCommandAckSchema>
export type DatabaseCommandAck<TResult = unknown> = Omit<
  ParsedDatabaseCommandAck,
  "result"
> & { result: TResult }

export const dataSourceCommandAckV3Schema = z
  .object({
    commandId: entityIdSchema,
    event: dataSourceMutationEventV3Schema,
    result: z.unknown(),
  })
  .strict()
type ParsedDataSourceCommandAckV3 = z.infer<
  typeof dataSourceCommandAckV3Schema
>
export type DataSourceCommandAckV3<TResult = unknown> = Omit<
  ParsedDataSourceCommandAckV3,
  "result"
> & { result: TResult }

export const databaseCommandExecutionAckSchema = z.union([
  databaseCommandAckSchema,
  dataSourceCommandAckV3Schema,
])
export type DatabaseCommandExecutionAck<TResult = unknown> =
  | DatabaseCommandAck<TResult>
  | DataSourceCommandAckV3<TResult>

const protocolErrorBase = {
  message: z.string().trim().min(1).max(2_000),
}

export const databaseProtocolErrorSchema = z.discriminatedUnion("code", [
  z
    .object({
      ...protocolErrorBase,
      code: z.literal("WINDOW_STALE"),
      currentSnapshot: z.string().trim().min(1).max(2_048).optional(),
    })
    .strict(),
  z
    .object({
      ...protocolErrorBase,
      code: z.literal("COMMAND_ID_REUSED"),
      commandId: entityIdSchema,
    })
    .strict(),
  z
    .object({
      ...protocolErrorBase,
      code: z.literal("ROW_MOVE_CONFLICT"),
      rowId: entityIdSchema,
    })
    .strict(),
])
export type DatabaseProtocolError = z.infer<
  typeof databaseProtocolErrorSchema
>
