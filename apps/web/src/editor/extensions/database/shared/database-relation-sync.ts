import {
  parsePropertyValue,
  toStringArray,
} from "../utils"

type RelationRow = {
  id: string
  pageId: string
}

type RelationProperty = {
  property: {
    config?: unknown
    id: string
  }
}

type RelationValue = {
  pageId: string
  propertyId: string
  value: unknown
}

type RelationPayload = {
  properties: RelationProperty[]
  rows: RelationRow[]
  values: RelationValue[]
}

type SourcePageSummary = {
  id: string
  metadata?: unknown
  name?: string
}

export type RelationReciprocalUpdate = {
  databaseId: string
  propertyId: string
  rowId: string
  value: string | string[] | null
}

export function getRelationReciprocalUpdates({
  nextPageIds,
  propertyConfig,
  relatedDatabasePayload,
  selectedPageIds,
  sourcePage,
}: {
  nextPageIds: string[]
  propertyConfig: unknown
  relatedDatabasePayload: RelationPayload | null | undefined
  selectedPageIds: string[]
  sourcePage: SourcePageSummary
}): RelationReciprocalUpdate[] {
  const relatedDatabaseId = getRelationTargetDatabaseId(propertyConfig)
  const relatedPropertyId = getRelationRelatedPropertyId(propertyConfig)

  if (
    !isTwoWayRelationConfig(propertyConfig) ||
    !relatedDatabaseId ||
    !relatedPropertyId ||
    !relatedDatabasePayload
  ) {
    return []
  }

  const removedPageIds = selectedPageIds.filter(
    (pageId) => !nextPageIds.includes(pageId)
  )
  const addedPageIds = nextPageIds.filter(
    (pageId) => !selectedPageIds.includes(pageId)
  )

  return [
    ...removedPageIds.flatMap((pageId) =>
      getRelationReciprocalUpdate({
        action: "remove",
        pageId,
        relatedDatabaseId,
        relatedDatabasePayload,
        relatedPropertyId,
        sourcePage,
      })
    ),
    ...addedPageIds.flatMap((pageId) =>
      getRelationReciprocalUpdate({
        action: "add",
        pageId,
        relatedDatabaseId,
        relatedDatabasePayload,
        relatedPropertyId,
        sourcePage,
      })
    ),
  ]
}

function getRelationReciprocalUpdate({
  action,
  pageId,
  relatedDatabaseId,
  relatedDatabasePayload,
  relatedPropertyId,
  sourcePage,
}: {
  action: "add" | "remove"
  pageId: string
  relatedDatabaseId: string
  relatedDatabasePayload: RelationPayload
  relatedPropertyId: string
  sourcePage: SourcePageSummary
}): RelationReciprocalUpdate[] {
  const relatedRow = relatedDatabasePayload.rows.find(
    (candidate) => candidate.pageId === pageId
  )

  if (!relatedRow) {
    return []
  }

  const relatedProperty = relatedDatabasePayload.properties.find(
    (property) => property.property.id === relatedPropertyId
  )
  const relatedPagePropertyId = relatedProperty?.property.id ?? relatedPropertyId
  const reciprocalMultiple =
    getRelationLimit(relatedProperty?.property.config) !== "one_page"
  const currentValue = parsePropertyValue(
    relatedDatabasePayload.values.find(
      (item) =>
        item.pageId === pageId && item.propertyId === relatedPagePropertyId
    )?.value,
    "relation"
  )
  const currentPageIds = toStringArray(currentValue)
  const nextPageIds =
    action === "add"
      ? currentPageIds.includes(sourcePage.id)
        ? currentPageIds
        : [...currentPageIds, sourcePage.id]
      : currentPageIds.filter((currentPageId) => currentPageId !== sourcePage.id)
  const nextValue = reciprocalMultiple
    ? nextPageIds
    : action === "add"
      ? sourcePage.id
      : currentPageIds[0] === sourcePage.id
        ? ""
        : currentPageIds[0] ?? ""

  return [
    {
      databaseId: relatedDatabaseId,
      propertyId: relatedPagePropertyId,
      rowId: relatedRow.id,
      value: reciprocalMultiple ? nextValue : nextValue || null,
    },
  ]
}

export function getRelationConfigWithPageSummary(
  propertyConfig: unknown,
  page: SourcePageSummary
) {
  const currentConfig =
    propertyConfig && typeof propertyConfig === "object" && !Array.isArray(propertyConfig)
      ? propertyConfig
      : {}
  const pageSummaries =
    "pageSummaries" in currentConfig &&
    currentConfig.pageSummaries &&
    typeof currentConfig.pageSummaries === "object" &&
    !Array.isArray(currentConfig.pageSummaries)
      ? currentConfig.pageSummaries
      : {}

  return {
    ...currentConfig,
    pageSummaries: {
      ...pageSummaries,
      [page.id]: {
        iconKind: "page",
        id: page.id,
        metadata: page.metadata,
        name: page.name,
      },
    },
  }
}

export function getRelationLimit(propertyConfig: unknown) {
  const relation = getRelationObject(propertyConfig)

  return relation?.limit === "one_page"
    ? "one_page"
    : "no_limit"
}

export function getRelationTargetDatabaseId(propertyConfig: unknown) {
  const relation = getRelationObject(propertyConfig)
  const relatedDatabaseId = relation?.relatedDatabaseId

  return typeof relatedDatabaseId === "string" ? relatedDatabaseId : null
}

function getRelationRelatedPropertyId(propertyConfig: unknown) {
  const relation = getRelationObject(propertyConfig)
  const relatedPropertyId = relation?.relatedPropertyId

  return typeof relatedPropertyId === "string" ? relatedPropertyId : null
}

function isTwoWayRelationConfig(propertyConfig: unknown) {
  const relation = getRelationObject(propertyConfig)

  return relation?.twoWayRelation === true
}

function getRelationObject(propertyConfig: unknown) {
  if (!propertyConfig || typeof propertyConfig !== "object" || Array.isArray(propertyConfig)) {
    return null
  }

  const relation = (propertyConfig as { relation?: unknown }).relation

  return relation && typeof relation === "object" && !Array.isArray(relation)
    ? (relation as Record<string, unknown>)
    : null
}
