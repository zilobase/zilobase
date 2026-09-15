export const databaseClientQueryRoot = "database-client-v2" as const

export function databaseClientQueryKey(
  sessionId: string,
  ...scope: readonly unknown[]
) {
  return [databaseClientQueryRoot, sessionId, ...scope] as const
}
