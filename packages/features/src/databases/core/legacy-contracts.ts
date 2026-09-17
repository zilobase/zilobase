

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

export type DatabasePayload = {
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

export type DatabaseAccessRule = {
  id: string
  workspaceId: string
  databaseId: string
  targetType: "public" | "user" | "team" | "agent"
  targetId: string
  accessLevel: "view" | "edit" | "full"
  createdAt: string
  updatedAt: string
}

export type DatabaseAccessPayload = { access: DatabaseAccessRule[] }

export * from  "./entities"
export * from  "./fixtures"
