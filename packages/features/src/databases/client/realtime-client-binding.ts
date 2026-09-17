import type { DatabaseMutationEventV2 } from  "../core/entities"

type MutationIngestTarget = {
  catchUp(databaseId: string): Promise<void>
  ingest(event: DatabaseMutationEventV2): Promise<void>
}

export function createRealtimeClientBinding(
  initialClient: MutationIngestTarget | null,
) {
  let client = initialClient

  return {
    bind(nextClient: MutationIngestTarget | null) {
      client = nextClient
    },
    async catchUp(databaseId: string) {
      if (!client) return false
      await client.catchUp(databaseId)
      return true
    },
    async ingest(event: DatabaseMutationEventV2) {
      if (!client) return false
      await client.ingest(event)
      return true
    },
  }
}
