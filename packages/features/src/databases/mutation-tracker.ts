const recentDatabaseMutationIds = new Set<string>()
const retentionMs = 15_000

export function createDatabaseClientMutationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function rememberDatabaseClientMutationId(clientMutationId: string) {
  recentDatabaseMutationIds.add(clientMutationId)
  globalThis.setTimeout(() => {
    recentDatabaseMutationIds.delete(clientMutationId)
  }, retentionMs)
}

export function isRecentDatabaseClientMutationId(
  clientMutationId: string | undefined,
) {
  return Boolean(
    clientMutationId && recentDatabaseMutationIds.has(clientMutationId),
  )
}
