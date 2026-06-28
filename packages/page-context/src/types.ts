export type ContextSourceRole = "primary" | "attached"

export type ContextAttachment = {
  id: string
  type: "page" | "database"
  title: string
  path: string
  emoji?: string | null
}

export type ContextSourceRef = {
  type: "page" | "database"
  id: string
  role: ContextSourceRole
}

export type DatabasePropertySchema = {
  id: string
  propertyId: string
  position: number
  property: {
    id: string
    name: string
    type: string
    config?: unknown
  }
}

export type DatabaseViewSchema = {
  id: string
  type: string
  name: string
  config?: unknown
  position: number
}

export type DatabaseRowContext = {
  id: string
  pageId: string
  position: number
  name: string
}

export type DatabaseValueContext = {
  propertyId: string
  value: unknown
  pageId: string
}

export type DatabaseContextPayload = {
  database: {
    id: string
    name: string
    pageId: string
    config?: unknown
  }
  properties: DatabasePropertySchema[]
  views: DatabaseViewSchema[]
  rowCount: number
  rows: DatabaseRowContext[]
  values: DatabaseValueContext[]
}

/** @deprecated Use DatabaseContextPayload */
export type DatabaseSchemaPayload = DatabaseContextPayload

export type PageDatabaseContext = {
  schema: DatabaseContextPayload
  linkedSourceSchemas: Record<string, DatabaseContextPayload>
}

export type PageContextSection = {
  kind: "page"
  role: ContextSourceRole
  id: string
  title: string
  path: string
  content: unknown
  databases: PageDatabaseContext[]
}

export type DatabaseContextSection = {
  kind: "database"
  role: ContextSourceRole
  schema: DatabaseContextPayload
  linkedSourceSchemas: Record<string, DatabaseContextPayload>
}

export type ContextSection = PageContextSection | DatabaseContextSection

export type BuildContextInput = {
  sections: ContextSection[]
  maxChars?: number
}

export type BuildContextResult = {
  markdown: string
  charCount: number
  trimmedAttachmentIds: string[]
}