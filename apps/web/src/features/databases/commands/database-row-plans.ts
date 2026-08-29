import type {
  DatabaseProperty,
  DatabaseRow,
} from "@zilobase/features/databases"

import {
  isSelectLikePropertyType,
} from "../core/database-property-types"
import { serializePropertyValue } from "../core/utils"
import {
  canUpdateKanbanGroupProperty,
  type DatabasePropertyListItem,
} from "../views/kanban/model/database-kanban-config"

export type NewRowPropertyValue = {
  propertyId: string
  value: unknown
}

export type NewRowSetup = {
  parentRelation?: {
    parentPropertyId: string
    parentRow: DatabaseRow
    subItemPropertyId: string
  }
  propertyValues: NewRowPropertyValue[]
  title: string
}

export function getNewRowGroupSetup(
  groupValue?: string | null,
  groupProperty?: DatabasePropertyListItem | null,
): NewRowSetup {
  if (!groupValue || !groupProperty) {
    return { propertyValues: [], title: "Untitled" }
  }

  if (groupProperty.id === "name") {
    return { propertyValues: [], title: groupValue }
  }

  if (!canUpdateKanbanGroupProperty(groupProperty)) {
    return { propertyValues: [], title: "Untitled" }
  }

  return {
    propertyValues: [
      {
        propertyId: groupProperty.property.id,
        value: serializePropertyValue(groupProperty.property.type, groupValue),
      },
    ],
    title: "Untitled",
  }
}

export function getDraggedRowGroupSetup(
  groupValue?: string,
  groupProperty?: DatabasePropertyListItem | null,
): NewRowSetup & { pageTitle?: string } {
  if (groupValue === undefined || !groupProperty) {
    return { propertyValues: [], title: "Untitled" }
  }

  if (groupProperty.id === "name") {
    return {
      pageTitle: groupValue,
      propertyValues: [],
      title: groupValue,
    }
  }

  if (!canUpdateKanbanGroupProperty(groupProperty)) {
    return { propertyValues: [], title: "Untitled" }
  }

  return {
    propertyValues: [
      {
        propertyId: groupProperty.property.id,
        value: serializePropertyValue(groupProperty.property.type, groupValue),
      },
    ],
    title: "Untitled",
  }
}

export function findAddedDatabaseRow(
  rows: DatabaseRow[],
  existingRowIds: Set<string>,
) {
  return rows.find((row) => !existingRowIds.has(row.id)) ?? rows.at(-1)
}

export function getTimelineGroupPropertyId(
  currentProperties: DatabaseProperty[],
) {
  const groupProperty =
    currentProperties.find((property) => property.property.type === "status") ??
    currentProperties.find(
      (property) =>
        property.property.type !== "status" &&
        isSelectLikePropertyType(property.property.type),
    ) ??
    currentProperties[0] ??
    null

  return groupProperty?.property.id
}
