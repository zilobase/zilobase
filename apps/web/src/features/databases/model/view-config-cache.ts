type DatabaseViewConfigSource = {
  config?: unknown
  id: string
}

function getViewConfigCacheKey(databaseId: string, databaseViewId: string) {
  return `${databaseId}:${databaseViewId}`
}

export function readLatestViewConfig({
  cache,
  databaseId,
  databaseViewId,
  fallbackConfig,
  views,
}: {
  cache: Map<string, unknown>
  databaseId: string
  databaseViewId: string
  fallbackConfig: unknown
  views: DatabaseViewConfigSource[] | undefined
}) {
  const configKey = getViewConfigCacheKey(databaseId, databaseViewId)

  return cache.has(configKey)
    ? cache.get(configKey)
    : (views?.find((view) => view.id === databaseViewId)?.config ??
        fallbackConfig)
}

export function writeLatestViewConfig({
  cache,
  config,
  databaseId,
  databaseViewId,
}: {
  cache: Map<string, unknown>
  config: unknown
  databaseId: string
  databaseViewId: string
}) {
  cache.set(getViewConfigCacheKey(databaseId, databaseViewId), config)
}
