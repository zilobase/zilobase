import { isReadOnlyPropertyType } from "../core/database-property-types"

export type ReadOnlyTimePropertySource = {
  createdAt: string
  page: {
    createdAt?: string
    updatedAt?: string
  }
  updatedAt: string
}

export const isReadOnlyTimeProperty = (type: string) =>
  isReadOnlyPropertyType(type)

export const getReadOnlyTimePropertyRawValue = (
  source: ReadOnlyTimePropertySource,
  type: string
) =>
  type === "created_time"
    ? source.page.createdAt ?? source.createdAt
    : source.page.updatedAt ?? source.updatedAt
