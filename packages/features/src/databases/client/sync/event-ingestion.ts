import type { ApiFetcher } from "../../../shared/api-fetcher"
import {
  databaseMutationEventV2Schema,
  databaseMutationFeedResponseSchema,
  type DatabaseMutationEventV2,
} from  "../../core/entities"
import { emitDatabaseMetric, type DatabaseMetricReason } from  "../../core/telemetry"
import type { DatabaseScope } from "../db-client"

type Dependencies = {
  apiFetch: ApiFetcher
  apply(event: DatabaseMutationEventV2): Promise<void>
  loadedVersion(databaseId: string): number
  reset(scope: DatabaseScope, reason: DatabaseMetricReason): Promise<void>
}

/** One ordered stream per host, shared by HTTP acknowledgements and realtime. */
export class DatabaseEventIngestion {
  private readonly versions = new Map<string, number>()
  private readonly tails = new Map<string, Promise<void>>()

  constructor(private readonly dependencies: Dependencies) {}

  ingest(input: DatabaseMutationEventV2) {
    const event = databaseMutationEventV2Schema.parse(input)
    return this.enqueue(event.databaseId, async () => {
      if (event.version <= this.version(event.databaseId)) return
      if (event.version > this.version(event.databaseId) + 1) {
        emitDatabaseMetric("gap_recovery", 1, "success", "event_gap")
        await this.catchUpNow(event.databaseId)
      }
      if (event.version <= this.version(event.databaseId)) return
      if (event.version !== this.version(event.databaseId) + 1) {
        await this.resetNow({ databaseId: event.databaseId }, "invalid_history")
        return
      }
      await this.apply(event)
    })
  }

  catchUp(databaseId: string) {
    return this.enqueue(databaseId, () => this.catchUpNow(databaseId))
  }

  reset(scope: DatabaseScope) {
    return this.enqueue(scope.databaseId, () => this.resetNow(scope, "manual"))
  }

  clear() {
    this.versions.clear()
    this.tails.clear()
  }

  private enqueue(databaseId: string, work: () => Promise<void>) {
    const previous = this.tails.get(databaseId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(work)
    this.tails.set(databaseId, next)
    return next.finally(() => {
      if (this.tails.get(databaseId) === next) this.tails.delete(databaseId)
    })
  }

  private version(databaseId: string) {
    // A newer snapshot in one view proves nothing about other projections.
    // Once established, only successful ingestion or a full reset advances it.
    // In particular, a partially applied event cannot acknowledge itself via
    // the snapshots it updated before another projection failed.
    const version = this.versions.get(databaseId) ??
      this.dependencies.loadedVersion(databaseId)
    this.versions.set(databaseId, version)
    return version
  }

  private async apply(event: DatabaseMutationEventV2) {
    await this.dependencies.apply(event)
    this.versions.set(event.databaseId, event.version)
  }

  private async resetNow(scope: DatabaseScope, reason: DatabaseMetricReason) {
    // Failed refreshes must not acknowledge history that was never loaded.
    await this.dependencies.reset(scope, reason)
    this.versions.set(scope.databaseId, this.dependencies.loadedVersion(scope.databaseId))
  }

  private async catchUpNow(databaseId: string) {
    while (true) {
      const afterVersion = this.version(databaseId)
      const response = databaseMutationFeedResponseSchema.parse(
        await this.dependencies.apiFetch(
          `/databases/${encodeURIComponent(databaseId)}` +
          `/mutations?afterVersion=${afterVersion}&limit=500`,
        ),
      )
      if (response.resetRequired) {
        await this.resetNow({ databaseId }, "expired_history")
        return
      }
      for (const event of response.events) {
        if (event.databaseId !== databaseId) {
          await this.resetNow({ databaseId }, "invalid_history")
          return
        }
        if (event.version <= this.version(databaseId)) continue
        if (event.version !== this.version(databaseId) + 1) {
          await this.resetNow({ databaseId }, "invalid_history")
          return
        }
        await this.apply(event)
      }
      const version = this.version(databaseId)
      if (
        (response.hasMore && version <= afterVersion) ||
        (!response.hasMore && version < response.latestVersion)
      ) {
        await this.resetNow({ databaseId }, "invalid_history")
        return
      }
      if (!response.hasMore) return
    }
  }
}
