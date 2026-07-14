import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type {
  DatabaseDelta,
  DatabaseMutationResponse,
} from "../databases/mutation-types"
import {
  pageRootQueryKey,
  type PagePropertiesPayload,
  type PageProperty,
  type PagePropertyValue,
} from "./queries"

export function applyDatabaseMutationToPageProperties(
  queryClient: QueryClient,
  mutation: DatabaseMutationResponse,
) {
  const entries = getPagePropertiesQueries(queryClient)

  for (const [queryKey, current] of entries) {
    if (!current?.databaseIds?.includes(mutation.databaseId)) continue

    const currentVersion = current.databaseVersions?.[mutation.databaseId]

    if (mutation.requiresRefetch) {
      if (currentVersion === undefined || mutation.version > currentVersion) {
        void queryClient.invalidateQueries({ exact: true, queryKey })
      }
      continue
    }

    if (currentVersion === undefined || mutation.version !== currentVersion + 1) {
      if (currentVersion === undefined || mutation.version > currentVersion) {
        void queryClient.invalidateQueries({ exact: true, queryKey })
      }
      continue
    }

    const pageId = typeof queryKey[1] === "string" ? queryKey[1] : null

    if (!pageId) continue

    queryClient.setQueryData(
      queryKey,
      applyMutationToPageProperties(current, pageId, mutation),
    )
  }
}

export function recoverPagePropertiesIfBehind(
  queryClient: QueryClient,
  databaseId: string,
  serverVersion: number,
) {
  for (const [queryKey, current] of getPagePropertiesQueries(queryClient)) {
    if (!current?.databaseIds?.includes(databaseId)) continue

    if ((current.databaseVersions?.[databaseId] ?? -1) < serverVersion) {
      void queryClient.invalidateQueries({ exact: true, queryKey })
    }
  }
}

export function preferNewestPagePropertiesPayload(
  current: PagePropertiesPayload | undefined,
  incoming: PagePropertiesPayload,
) {
  if (!current) return incoming

  for (const [databaseId, incomingVersion] of Object.entries(
    incoming.databaseVersions ?? {},
  )) {
    const currentVersion = current.databaseVersions?.[databaseId]

    if (currentVersion !== undefined && currentVersion > incomingVersion) {
      return current
    }
  }

  return incoming
}

function applyMutationToPageProperties(
  current: PagePropertiesPayload,
  pageId: string,
  mutation: DatabaseMutationResponse,
): PagePropertiesPayload {
  const removedPropertyIds = new Set(
    mutation.delta.removedPagePropertyIds ?? [],
  )
  const properties = current.properties.filter(
    (property) => !removedPropertyIds.has(property.id),
  )
  const propertyPatches = getPagePropertyPatches(mutation.delta)

  for (const patch of propertyPatches) {
    const index = properties.findIndex((property) => property.id === patch.id)

    if (index >= 0) {
      properties[index] = { ...properties[index], ...patch }
    } else {
      properties.push(patch)
    }
  }

  const addedPropertyIds = propertyPatches.map(
    (property) => property.id,
  )
  const presenceTargets = current.presenceTargets?.map((target) => {
    if (target.databaseId !== mutation.databaseId) return target

    return {
      ...target,
      propertyIds: [
        ...new Set([
          ...target.propertyIds.filter(
            (propertyId) => !removedPropertyIds.has(propertyId),
          ),
          ...addedPropertyIds,
        ]),
      ],
    }
  })

  const values = current.values.filter(
    (value) => !removedPropertyIds.has(value.propertyId),
  )

  for (const patch of mutation.delta.values ?? []) {
    if (patch.pageId !== pageId) continue

    const index = values.findIndex(
      (value) =>
        value.pageId === patch.pageId &&
        value.propertyId === patch.propertyId,
    )
    const value: PagePropertyValue = {
      createdAt:
        patch.createdAt ??
        (index >= 0 ? values[index]?.createdAt : undefined) ??
        new Date().toISOString(),
      id:
        patch.id ??
        (index >= 0 ? values[index]?.id : undefined) ??
        crypto.randomUUID(),
      pageId: patch.pageId,
      propertyId: patch.propertyId,
      updatedAt: patch.updatedAt,
      value: patch.value,
    }

    if (index >= 0) {
      values[index] = value
    } else {
      values.push(value)
    }
  }

  return {
    ...current,
    databaseVersions: {
      ...current.databaseVersions,
      [mutation.databaseId]: mutation.version,
    },
    presenceTargets,
    properties,
    values,
  }
}

function getPagePropertyPatches(delta: DatabaseDelta) {
  return (delta.properties ?? []).flatMap((column) => {
    const property = column.property

    if (
      !property ||
      typeof property !== "object" ||
      Array.isArray(property) ||
      typeof (property as Record<string, unknown>).id !== "string"
    ) {
      return []
    }

    return [property as PageProperty]
  })
}

function getPagePropertiesQueries(queryClient: QueryClient) {
  return queryClient
    .getQueriesData<PagePropertiesPayload>({ queryKey: pageRootQueryKey() })
    .filter(([queryKey]) => isPagePropertiesQuery(queryKey))
}

function isPagePropertiesQuery(queryKey: QueryKey) {
  return queryKey[0] === "page" && queryKey[2] === "properties"
}
