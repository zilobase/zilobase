import type {
  DatabaseMutationEventV2,
  DataSourceMutationEventV3,
} from "../contracts-v2"

type MutationIngestTarget = {
  catchUp(sourceId: string): Promise<void>
  ingest(event: DatabaseMutationEventV2 | DataSourceMutationEventV3): Promise<void>
}

export function createRealtimeClientBinding(
  initialClient: MutationIngestTarget | null,
) {
  let client = initialClient

  return {
    bind(nextClient: MutationIngestTarget | null) {
      client = nextClient
    },
    async catchUp(sourceId: string) {
      if (!client) return false
      await client.catchUp(sourceId)
      return true
    },
    async ingest(event: DatabaseMutationEventV2 | DataSourceMutationEventV3) {
      if (!client) return false
      await client.ingest(event)
      return true
    },
  }
}
