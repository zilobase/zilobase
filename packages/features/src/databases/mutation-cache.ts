import type { QueryClient, QueryKey } from "@tanstack/react-query"

import { applyDatabaseDelta } from "./apply-delta"
import { setDatabasePayloadQueryData } from "./query-cache"
import {
  databasePayloadRootQueryKey,
  databaseQueryKey,
  type DatabasePayload,
} from "./queries"
import {
  isDatabaseMutationResponse,
  type DatabaseDelta,
  type DatabaseMutationResponse,
} from "./mutation-types"

export function applyVersionedDatabaseMutation(
  queryClient: QueryClient,
  response: DatabaseMutationResponse,
) {
  const entries = queryClient.getQueriesData<DatabasePayload | null>({
    queryKey: databasePayloadRootQueryKey(response.databaseId),
  })
  let gapDetected = entries.length === 0
  let payload = queryClient.getQueryData<DatabasePayload | null>(
    databaseQueryKey(response.databaseId),
  ) ?? null

  if (response.requiresRefetch) {
    const hasNewerData = entries.some(([, current]) =>
      current && response.version > (current.database.version ?? 0)
    )

    if (entries.length === 0 || hasNewerData) {
      void queryClient.invalidateQueries({
        queryKey: databasePayloadRootQueryKey(response.databaseId),
      })
    }

    return { gapDetected: true, payload }
  }

  for (const [queryKey, current] of entries) {
    if (!current) continue

    const currentVersion = current.database.version ?? 0

    if (response.version <= currentVersion) continue

    if (response.version !== currentVersion + 1) {
      gapDetected = true
      continue
    }

    const delta = isSchemaQuery(queryKey)
      ? schemaDelta(response.delta)
      : response.delta
    const next = applyDatabaseDelta(current, delta)
    const versioned = {
      ...next,
      database: { ...next.database, version: response.version },
    }

    queryClient.setQueryData(queryKey, versioned)

    if (isDefaultFullQuery(queryKey)) payload = versioned
  }

  if (gapDetected) {
    void queryClient.invalidateQueries({
      queryKey: databasePayloadRootQueryKey(response.databaseId),
    })
  }

  return { gapDetected, payload }
}

export function applyMutationToCache(
  queryClient: QueryClient,
  databaseId: string,
  response: unknown,
): DatabasePayload | null {
  if (isDatabaseMutationResponse(response)) {
    return applyVersionedDatabaseMutation(queryClient, response).payload
  }

  if (
    response &&
    typeof response === "object" &&
    "database" in response &&
    typeof (response as DatabasePayload).database?.id === "string"
  ) {
    const payload = response as DatabasePayload

    setDatabasePayloadQueryData(queryClient, databaseId, payload)

    return payload
  }

  return null
}

function schemaDelta(delta: DatabaseDelta): DatabaseDelta {
  return {
    database: delta.database,
    properties: delta.properties,
    removedPropertyIds: delta.removedPropertyIds,
    removedViewIds: delta.removedViewIds,
    views: delta.views,
  }
}

function isSchemaQuery(queryKey: QueryKey) {
  return queryKey[2] === "schema"
}

function isDefaultFullQuery(queryKey: QueryKey) {
  return queryKey[2] === "full" && queryKey[3] === "active-only"
}
