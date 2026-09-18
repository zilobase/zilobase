/**
 * Wire shape of `GET /databases/:id/export` and the derived AI/task context
 * payloads. This is a genuine endpoint contract, not client state: the
 * interactive database client reads bootstrap plus record windows
 * (`entities.ts`) and never fetches this shape. Keep export-only concerns
 * here; do not reuse these types for interactive UI state.
 */

export type DatabaseRecord = {
  id: string
  workspaceId: string
  pageId: string | null
  accessLevel?: "view" | "edit" | "full" | null
  createdById?: string | null
  name: string
  config?: unknown
  dataSourceConfig?: unknown
  isFavorite?: boolean
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export type DatabaseProperty = {
  id: string
  dataSourceId: string
  propertyId: string
  position: number
  width?: number | null
  visible: boolean
  property: PageProperty
  createdAt: string
  updatedAt: string
}

export type PageProperty = {
  id: string
  workspaceId: string
  name: string
  type: string
  config?: unknown
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type DatabaseView = {
  id: string
  databaseId: string
  dataSourceId: string
  type: string
  name: string
  config?: unknown
  position: number
  createdAt: string
  updatedAt: string
}

export type DatabaseRow = {
  id: string
  dataSourceId: string
  pageId: string
  parentRowId?: string | null
  position: number
  page: {
    createdAt?: string
    deletedAt?: string | null
    id: string
    name: string
    metadata?: unknown
    updatedAt?: string
  }
  createdById?: string | null
  lastEditedById?: string | null
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type PagePropertyValue = {
  id: string
  pageId: string
  propertyId: string
  value: unknown
  createdAt: string
  updatedAt: string
}

export type DatabaseRowsPagination = {
  hasMore: boolean
  nextCursor: number | null
}

export type DatabaseExportPayload = {
  activeDataSource: DataSourceRecord | null
  dataSources: DataSourceRecord[]
  database: DatabaseRecord
  properties: DatabaseProperty[]
  views: DatabaseView[]
  rows: DatabaseRow[]
  rowCount?: number
  rowsPagination?: DatabaseRowsPagination
  values: PagePropertyValue[]
}

export type DataSourceRecord = {
  id: string
  workspaceId: string
  parentDatabaseId: string
  createdById?: string | null
  name: string
  config?: unknown
  configVersion: number
  version: number
  deletedById?: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  linkedAt?: string
  position?: number
}
