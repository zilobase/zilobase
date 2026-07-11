import {
  parsePropertyValue,
  toStringArray,
} from "../core/utils"

type RelationRow = {
  id: string
  page?: SourcePageSummary
  pageId: string
}

type RelationProperty = {
  id: string
  property: {
    config?: unknown
    id: string
    type?: string
  }
}

type RelationValue = {
  pageId: string
  propertyId: string
  value: unknown
}

type RelationPayload = {
  database?: { id?: string }
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
  config?: unknown
  databaseId: string
  databasePropertyId?: string
  propertyId: string
  rowId: string
  value: string | string[] | null
}

export type RelationLimitTrimUpdate = {
  propertyId: string
  rowId: string
  value: string | null
}

export type RelationConfigUpdate = {
  config: unknown
  databaseId: string
  databasePropertyId: string
}

export type RelationRepairPrimarySource = "source" | "related"

export function getRelationTwoWayConfigUpdate({
  nextTwoWayRelation,
  propertyConfig,
  relatedDatabasePayload,
}: {
  nextTwoWayRelation: boolean
  propertyConfig: unknown
  relatedDatabasePayload: RelationPayload | null | undefined
}): RelationConfigUpdate | null {
  const relatedDatabaseId = getRelationTargetDatabaseId(propertyConfig)
  const relatedPropertyId = getRelationRelatedPropertyId(propertyConfig)

  if (!relatedDatabaseId || !relatedPropertyId || !relatedDatabasePayload) {
    return null
  }

  const relatedProperty = relatedDatabasePayload.properties.find(
    (property) => property.property.id === relatedPropertyId
  )

  return relatedProperty
    ? {
        config: getRelationConfigWithTwoWayRelation(
          relatedProperty.property.config,
          nextTwoWayRelation
        ),
        databaseId: relatedDatabaseId,
        databasePropertyId: relatedProperty.id,
      }
    : null
}

export function getRelationRepairMutationPlan({
  databaseId,
  databasePropertyId,
  payload,
  primarySource = "source",
  propertyConfig,
  relatedDatabasePayload,
}: {
  databaseId: string
  databasePropertyId: string
  payload: RelationPayload | null | undefined
  primarySource?: RelationRepairPrimarySource
  propertyConfig: unknown
  relatedDatabasePayload: RelationPayload | null | undefined
}): {
  configUpdates: RelationConfigUpdate[]
  valueUpdates: RelationReciprocalUpdate[]
} | null {
  const relatedDatabaseId = getRelationTargetDatabaseId(propertyConfig)
  const relatedPropertyId = getRelationRelatedPropertyId(propertyConfig)

  if (!payload || !relatedDatabasePayload || !relatedDatabaseId || !relatedPropertyId) {
    return null
  }

  const relatedProperty = relatedDatabasePayload.properties.find(
    (property) => property.property.id === relatedPropertyId
  )
  const sourceProperty = payload.properties.find(
    (property) => property.id === databasePropertyId
  )

  if (!sourceProperty || !relatedProperty) {
    return null
  }

  let nextConfig: unknown = propertyConfig
  let nextRelatedConfig: unknown = relatedProperty?.property.config
  const valueUpdates =
    primarySource === "related"
      ? getMirroredRelationUpdates({
          fromPayload: relatedDatabasePayload,
          fromPropertyId: relatedProperty.property.id,
          targetDatabaseId: databaseId,
          targetDatabasePropertyId: databasePropertyId,
          targetPayload: payload,
          targetPropertyConfig: propertyConfig,
          targetPropertyId: sourceProperty.property.id,
        })
      : getMirroredRelationUpdates({
          fromPayload: payload,
          fromPropertyId: sourceProperty.property.id,
          targetDatabaseId: relatedDatabaseId,
          targetDatabasePropertyId: relatedProperty.id,
          targetPayload: relatedDatabasePayload,
          targetPropertyConfig: relatedProperty.property.config,
          targetPropertyId: relatedProperty.property.id,
        })

  for (const update of valueUpdates) {
    if (!update.config || !update.databasePropertyId) {
      continue
    }

    if (update.databasePropertyId === databasePropertyId) {
      nextConfig = update.config
    }

    if (update.databasePropertyId === relatedProperty?.id) {
      nextRelatedConfig = update.config
    }
  }

  return {
    configUpdates: [
      {
        config: getRelationConfigWithSyncStatus(nextConfig, "synced"),
        databaseId,
        databasePropertyId,
      },
      ...(relatedProperty
        ? [
            {
              config: getRelationConfigWithSyncStatus(nextRelatedConfig, "synced"),
              databaseId: relatedDatabaseId,
              databasePropertyId: relatedProperty.id,
            },
          ]
        : []),
    ],
    valueUpdates,
  }
}

function getMirroredRelationUpdates({
  fromPayload,
  fromPropertyId,
  targetDatabaseId,
  targetDatabasePropertyId,
  targetPayload,
  targetPropertyConfig,
  targetPropertyId,
}: {
  fromPayload: RelationPayload
  fromPropertyId: string
  targetDatabaseId: string
  targetDatabasePropertyId: string
  targetPayload: RelationPayload
  targetPropertyConfig: unknown
  targetPropertyId: string
}): RelationReciprocalUpdate[] {
  const desiredPageIdsByTargetPageId = new Map<string, string[]>()
  let nextTargetConfig = targetPropertyConfig

  for (const value of fromPayload.values) {
    if (value.propertyId !== fromPropertyId) {
      continue
    }

    const sourceRow = fromPayload.rows.find((row) => row.pageId === value.pageId)
    const sourcePage = sourceRow?.page ?? { id: value.pageId }
    nextTargetConfig = getRelationConfigWithPageSummary(nextTargetConfig, sourcePage)

    for (const targetPageId of toStringArray(parsePropertyValue(value.value, "relation"))) {
      const desiredPageIds = desiredPageIdsByTargetPageId.get(targetPageId) ?? []

      if (!desiredPageIds.includes(value.pageId)) {
        desiredPageIdsByTargetPageId.set(targetPageId, [...desiredPageIds, value.pageId])
      }
    }
  }

  return targetPayload.rows.flatMap((row) => {
    const currentPageIds = toStringArray(
      parsePropertyValue(
        targetPayload.values.find(
          (value) =>
            value.pageId === row.pageId && value.propertyId === targetPropertyId
        )?.value,
        "relation"
      )
    )
    const desiredPageIds = desiredPageIdsByTargetPageId.get(row.pageId) ?? []

    if (arraysEqual(currentPageIds, desiredPageIds)) {
      return []
    }

    const multiple = getRelationLimit(targetPropertyConfig) !== "one_page"
    const value = multiple ? desiredPageIds : desiredPageIds[0] ?? null

    return [
      {
        config: nextTargetConfig,
        databaseId: targetDatabaseId,
        databasePropertyId: targetDatabasePropertyId,
        propertyId: targetPropertyId,
        rowId: row.id,
        value,
      },
    ]
  })
}

function arraysEqual(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

export function getRelationConfigWithSyncStatus(
  propertyConfig: unknown,
  syncStatus: "not_synced" | "synced"
) {
  const currentConfig =
    propertyConfig && typeof propertyConfig === "object" && !Array.isArray(propertyConfig)
      ? propertyConfig
      : {}
  const relation = getRelationObject(propertyConfig) ?? {}

  return {
    ...currentConfig,
    relation: {
      ...relation,
      syncStatus,
    },
  }
}

export function getRelationNeedsRepair({
  propertyConfig,
  relatedDatabasePayload,
}: {
  propertyConfig: unknown
  relatedDatabasePayload: RelationPayload | null | undefined
}) {
  const relatedPropertyId = getRelationRelatedPropertyId(propertyConfig)
  const relatedProperty = relatedDatabasePayload?.properties.find(
    (property) => property.property.id === relatedPropertyId
  )

  return (
    getRelationSyncStatus(propertyConfig) === "not_synced" ||
    getRelationSyncStatus(relatedProperty?.property.config) === "not_synced"
  )
}

export function getRelationLimitTrimUpdates({
  databasePropertyId,
  payload,
  propertyConfig,
}: {
  databasePropertyId: string
  payload: RelationPayload | null | undefined
  propertyConfig: unknown
}): RelationLimitTrimUpdate[] {
  if (getRelationLimit(propertyConfig) !== "one_page" || !payload) {
    return []
  }

  const property = payload.properties.find(
    (candidate) =>
      candidate.id === databasePropertyId &&
      candidate.property.type === "relation"
  )

  if (!property) {
    return []
  }

  return payload.values.flatMap((value) => {
    if (value.propertyId !== property.property.id) {
      return []
    }

    const pageIds = toStringArray(parsePropertyValue(value.value, "relation"))

    if (!Array.isArray(value.value) && pageIds.length <= 1) {
      return []
    }

    const row = payload.rows.find((candidate) => candidate.pageId === value.pageId)

    return row
      ? [{ propertyId: property.property.id, rowId: row.id, value: pageIds[0] ?? null }]
      : []
  })
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
  const relatedDatabasePropertyId = relatedProperty?.id
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
      config:
        action === "add" && relatedProperty
          ? getRelationConfigWithPageSummary(
              relatedProperty.property.config,
              sourcePage
            )
          : undefined,
      databaseId: relatedDatabaseId,
      databasePropertyId: relatedDatabasePropertyId,
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

export function getRelationConfigWithTwoWayRelation(
  propertyConfig: unknown,
  twoWayRelation: boolean
) {
  const currentConfig =
    propertyConfig && typeof propertyConfig === "object" && !Array.isArray(propertyConfig)
      ? propertyConfig
      : {}
  const relation = getRelationObject(propertyConfig) ?? {}

  return {
    ...currentConfig,
    relation: {
      ...relation,
      twoWayRelation,
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

function getRelationSyncStatus(propertyConfig: unknown) {
  const relation = getRelationObject(propertyConfig)

  return relation?.syncStatus === "not_synced" ? "not_synced" : "synced"
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
