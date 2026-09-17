import type { QueryClient } from "@tanstack/react-query"
import {
  createTransaction,
  DbClient as TanStackDbClient,
} from "@tanstack/react-db"

import type { ApiFetcher } from "../../shared/api-fetcher"
import { applyDatabaseMutationToPageProperties } from "../../pages/database-realtime-cache"
import type {
  DatabaseBootstrapResponse,
  DatabaseCommand,
  DatabaseInitialPageSize,
  DatabaseMutationEventV2,
  DatabaseRecordEntity,
} from  "../core/entities"
import { getDatabaseInitialPageSize } from  "../views/view-evaluation"
import { databaseContextExportRootQueryKey } from  "../queries/queries"
import {
  emitDatabaseMetric,
  type DatabaseMetricReason,
} from  "../core/telemetry"
import {
  createDatabaseBootstrapCollections,
  databaseBootstrapQueryKey,
  readBootstrapCollectionStatus,
  type DatabaseBootstrapCollections,
} from "./bootstrap-collections"
import { databaseClientQueryRoot } from "./query-keys"
import {
  DatabaseCommandLanes,
  databaseCommandLane,
} from "./command-lanes"
import { applyOptimisticCommand } from "./optimistic-commands"
import { DatabaseEventIngestion } from "./sync/event-ingestion"
import { DatabaseCommandStateStore } from "./commands/command-state"
import { sendDatabaseCommand } from "./commands/command-transport"
import {
  createDatabaseRecordCollection,
  toDatabaseRecord,
  type DatabaseRecordCollection,
} from "./record-collections"
export { databaseClientQueryKey, databaseClientQueryRoot } from "./query-keys"

export type DatabaseScope = {
  databaseId: string
  includeDeleted?: boolean
  viewId?: string | null
}

export type DatabaseViewScope = DatabaseScope & {
  dataSourceId: string
  includeDeleted?: boolean
  viewId: string
}

export type DatabaseBootstrapState = {
  data: DatabaseBootstrapResponse | undefined
  error: Error | null
  scope: DatabaseScope
  status: "idle" | "loading" | "success" | "error"
}

export type DatabaseRecordWindow = {
  error: Error | null
  fetchNextPage: () => Promise<void>
  hasMore: boolean
  isFetchingNextPage: boolean
  pageSize: DatabaseInitialPageSize
  records: DatabaseRecordEntity[]
  scope: DatabaseViewScope
  status: "idle" | "loading" | "success" | "error"
  totalCount: number
}

export type DatabaseClientCommand<TCommand extends DatabaseCommand = DatabaseCommand> = {
  command: TCommand
  databaseId: string
  dataSourceId?: string | null
}

export type DatabaseCommandTransaction<TResult = unknown> = {
  commandId: string
  promise: Promise<TResult>
}

export type DatabaseCommandTarget = {
  dataSourceId?: string
  hostDatabaseId?: string
  propertyId?: string
  rowId?: string
  viewId?: string
}

export type DatabaseEntityCommandState = {
  error: Error | null
  isPending: boolean
  pendingCount: number
}

export type DatabaseClient = {
  readonly sessionId: string
  bootstrap(scope: DatabaseScope): DatabaseBootstrapState
  records(scope: DatabaseViewScope): DatabaseRecordWindow
  execute<TResult>(
    command: DatabaseClientCommand,
  ): DatabaseCommandTransaction<TResult>
  commandState(target: DatabaseCommandTarget): DatabaseEntityCommandState
  subscribeCommandState(
    target: DatabaseCommandTarget,
    listener: () => void,
  ): () => void
  ingest(event: DatabaseMutationEventV2): Promise<void>
  catchUp(databaseId: string): Promise<void>
  reset(scope: DatabaseScope): Promise<void>
}

type DatabaseClientOptions = {
  apiFetch: ApiFetcher
  queryClient: QueryClient
  sessionId: string
}

export class SessionDatabaseClient implements DatabaseClient {
  readonly sessionId: string
  readonly tanstack: TanStackDbClient
  private readonly apiFetch: ApiFetcher
  private readonly bootstrapCollections = new Map<
    string,
    DatabaseBootstrapCollections
  >()
  private readonly commandLanes = new DatabaseCommandLanes()
  private readonly commandStates = new DatabaseCommandStateStore()
  private readonly cleanups = new Set<() => Promise<void> | void>()
  private disposed = false
  private readonly eventIngestion: DatabaseEventIngestion
  private readonly queryClient: QueryClient
  private readonly recordCollections = new Map<string, DatabaseRecordCollection>()

  constructor({ apiFetch, queryClient, sessionId }: DatabaseClientOptions) {
    this.apiFetch = apiFetch
    this.queryClient = queryClient
    this.sessionId = sessionId
    this.tanstack = new TanStackDbClient({ queryClient })
    this.eventIngestion = new DatabaseEventIngestion({
      apiFetch,
      apply: (event) => this.applyEvent(event),
      loadedVersion: (databaseId) => this.loadedVersion(databaseId),
      reset: (scope, reason) => this.resetNow(scope, reason),
    })
  }

  bootstrap(scope: DatabaseScope): DatabaseBootstrapState {
    this.assertActive()
    const collections = this.getBootstrapCollections(scope)
    const queryKey = databaseBootstrapQueryKey(this.sessionId, scope)
    const state = {
      ...readBootstrapCollectionStatus(
        collections,
        this.queryClient,
        queryKey,
      ),
      scope,
    }
    return state
  }

  records(scope: DatabaseViewScope): DatabaseRecordWindow {
    this.assertActive()
    const resource = this.getRecordCollection(scope)
    const latest = resource.getLatestWindow()
    return {
      error: resource.records.utils.lastError instanceof Error
        ? resource.records.utils.lastError
        : null,
      fetchNextPage: async () => undefined,
      hasMore: latest?.hasMore ?? false,
      isFetchingNextPage: false,
      pageSize: resource.pageSize,
      records: [...resource.records.state.values()].map(toDatabaseRecord),
      scope,
      status: resource.records.utils.isError
        ? "error"
        : resource.records.utils.isLoading
          ? "loading"
          : resource.records.status === "ready"
            ? "success"
            : "idle",
      totalCount: latest?.totalCount ?? resource.records.size,
    }
  }

  execute<TResult>(
    input: DatabaseClientCommand,
  ): DatabaseCommandTransaction<TResult> {
    this.assertActive()
    const lane = databaseCommandLane(input)
    const commandId = crypto.randomUUID()
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return {
        commandId,
        promise: this.trackCommand<TResult>(input, Promise.reject(
          new Error("You are offline. Reconnect and try your edit again."),
        )),
      }
    }
    const persist = () => this.commandLanes.run(
      lane.key,
      lane.cancelAfterFailure,
      () => this.sendCommand<TResult>(input, commandId),
    )
    if (input.command.type === "cell.set") {
      applyOptimisticCommand({
        bootstrapCollections: this.bootstrapCollections.values(),
        commandId,
        input,
        recordCollections: this.recordCollections.values(),
        shouldOrderByKey: (scope) => this.shouldOrderByKey(scope),
      })
      const promise = persist().then(
        (result) => {
          this.settleCellOverlay(commandId)
          return result
        },
        (error) => {
          this.settleCellOverlay(commandId)
          throw error
        },
      )
      return { commandId, promise: this.trackCommand(input, promise) }
    }

    let result: TResult
    const transaction = createTransaction({
      autoCommit: false,
      id: commandId,
      metadata: { commandId, lane: lane.key },
      mutationFn: async () => {
        result = await persist()
      },
    })
    transaction.mutate(() => {
      applyOptimisticCommand({
        bootstrapCollections: this.bootstrapCollections.values(),
        commandId,
        input,
        recordCollections: this.recordCollections.values(),
        shouldOrderByKey: (scope) => this.shouldOrderByKey(scope),
      })
    })
    if (transaction.mutations.length === 0) {
      void transaction.commit().catch(() => undefined)
      return { commandId, promise: this.trackCommand(input, persist()) }
    }
    void transaction.commit().catch(() => undefined)
    return {
      commandId,
      promise: this.trackCommand(
        input,
        transaction.isPersisted.promise.then(() => result),
      ),
    }
  }

  commandState(target: DatabaseCommandTarget): DatabaseEntityCommandState {
    this.assertActive()
    return this.commandStates.get(target)
  }

  subscribeCommandState(
    target: DatabaseCommandTarget,
    listener: () => void,
  ) {
    this.assertActive()
    return this.commandStates.subscribe(target, listener)
  }

  async ingest(input: DatabaseMutationEventV2) {
    this.assertActive()
    await this.eventIngestion.ingest(input)
  }

  async catchUp(databaseId: string) {
    this.assertActive()
    await this.eventIngestion.catchUp(databaseId)
  }

  async reset(scope: DatabaseScope) {
    this.assertActive()
    await this.eventIngestion.reset(scope)
  }

  registerCleanup(cleanup: () => Promise<void> | void) {
    this.assertActive()
    this.cleanups.add(cleanup)
    return () => this.cleanups.delete(cleanup)
  }

  getBootstrapCollections(scope: DatabaseScope) {
    this.assertActive()
    const key = JSON.stringify([
      scope.databaseId,
      scope.viewId ?? null,
      scope.includeDeleted === true,
    ])
    let collections = this.bootstrapCollections.get(key)
    if (!collections) {
      collections = createDatabaseBootstrapCollections({
        apiFetch: this.apiFetch,
        queryClient: this.queryClient,
        scope,
        sessionId: this.sessionId,
      })
      this.bootstrapCollections.set(key, collections)
      this.cleanups.add(() => collections?.cleanup())
    }
    return collections
  }

  getRecordCollection(scope: DatabaseViewScope) {
    this.assertActive()
    const key = JSON.stringify([
      scope.databaseId,
      scope.dataSourceId,
      scope.viewId,
      scope.includeDeleted === true,
    ])
    let collection = this.recordCollections.get(key)
    if (!collection) {
      collection = createDatabaseRecordCollection({
        apiFetch: this.apiFetch,
        pageSize: this.getRecordPageSize(scope),
        queryClient: this.queryClient,
        scope,
        sessionId: this.sessionId,
      })
      this.recordCollections.set(key, collection)
      this.cleanups.add(() => collection?.cleanup())
    }
    return collection
  }

  getRecordPageSize(scope: DatabaseViewScope) {
    const bootstrap = this.queryClient.getQueryData<DatabaseBootstrapResponse>(
      databaseBootstrapQueryKey(this.sessionId, scope),
    )
    const view = bootstrap?.views.find((candidate) => candidate.id === scope.viewId)
    return getDatabaseInitialPageSize(view?.config ?? bootstrap?.database.config)
  }

  getApiFetch() {
    this.assertActive()
    return this.apiFetch
  }

  getQueryClient() {
    this.assertActive()
    return this.queryClient
  }

  isDisposed() {
    return this.disposed
  }

  async cleanup() {
    if (this.disposed) return
    this.disposed = true
    await Promise.allSettled([
      ...[...this.cleanups].map((cleanup) => Promise.resolve(cleanup())),
      this.tanstack.cleanup(),
    ])
    this.cleanups.clear()
    this.bootstrapCollections.clear()
    this.commandLanes.clear()
    this.commandStates.clear()
    this.eventIngestion.clear()
    this.recordCollections.clear()
    this.queryClient.removeQueries({
      queryKey: [databaseClientQueryRoot, this.sessionId],
    })
  }

  private assertActive() {
    if (this.disposed) throw new Error("Database client session is disposed")
  }

  private async sendCommand<TResult>(
    input: DatabaseClientCommand,
    commandId: string,
  ) {
    this.assertActive()
    const startedAt = performance.now()
    try {
      const response = await sendDatabaseCommand(this.apiFetch, input, commandId)
      if (this.disposed) return response.result as TResult
      try {
        await this.ingest(response.event)
      } catch {
        try {
          await this.reset({ databaseId: input.databaseId })
        } catch (cause) {
          const error = new Error("Your change was saved, but this view could not refresh. Reload to see the saved data.", { cause })
          error.name = "DatabaseReconciliationError"
          this.commandStates.reportError(input, error)
        }
      }
      emitDatabaseMetric(
        "acknowledgement_latency",
        performance.now() - startedAt,
      )
      return response.result as TResult
    } catch (error) {
      emitDatabaseMetric(
        "acknowledgement_latency",
        performance.now() - startedAt,
        "failure",
      )
      throw error
    }
  }

  private settleCellOverlay(commandId: string) {
    for (const resource of this.recordCollections.values()) {
      resource.settleCellOverlay(commandId)
    }
  }

  private trackCommand<TResult>(
    input: DatabaseClientCommand,
    promise: Promise<TResult>,
  ) {
    return this.commandStates.track(input, promise).catch((cause) => {
      emitDatabaseMetric("rollback", 1, "failure", "command_failure")
      throw cause
    })
  }

  private async applyEvent(
    event: DatabaseMutationEventV2,
  ) {
    applyDatabaseMutationToPageProperties(this.queryClient, event)
    if (event.requiresReset) {
      await this.resetNow({ databaseId: event.databaseId }, "event_reset", event.version)
    } else {
      for (const collections of this.bootstrapCollections.values()) {
        if (collections.scope.databaseId === event.databaseId) {
          collections.apply(event)
        }
      }
      for (const resource of this.recordCollections.values()) {
        if (
          resource.scope.databaseId === event.databaseId &&
          (event.dataSourceId === null ||
            resource.scope.dataSourceId === event.dataSourceId)
        ) {
          let fallback: "apply_failed" | "source_mismatch" | null = null
          let fallbackError: unknown
          try {
            const outcome = resource.apply(
              event,
              this.shouldOrderByKey(resource.scope),
            )
            if (outcome === "source_mismatch") {
              fallback = outcome
            }
          } catch (error) {
            fallback = "apply_failed"
            fallbackError = error
          }
          if (fallback) {
            logRecordApplyFallback(event, resource, fallback, fallbackError)
            await resource.reset()
          }
        }
      }
    }
    void this.queryClient.invalidateQueries({
      queryKey: databaseContextExportRootQueryKey(event.databaseId),
    })
  }

  private async resetNow(
    scope: DatabaseScope,
    reason: DatabaseMetricReason = "manual",
    minimumVersion = 0,
  ) {
    emitDatabaseMetric("reset", 1, "success", reason)
    const work: Promise<void>[] = []
    for (const collections of this.bootstrapCollections.values()) {
      if (scopeMatches(collections.scope, scope)) {
        work.push(collections.refetch(minimumVersion))
      }
    }
    for (const resource of this.recordCollections.values()) {
      if (scopeMatches(resource.scope, scope)) work.push(resource.reset(minimumVersion))
    }
    await Promise.all(work)
  }

  private shouldOrderByKey(scope: DatabaseViewScope) {
    const bootstrap = this.queryClient.getQueryData<DatabaseBootstrapResponse>(
      databaseBootstrapQueryKey(this.sessionId, scope),
    )
    const config = bootstrap?.views.find((view) => view.id === scope.viewId)?.config
    return !hasExplicitSort(config)
  }

  private loadedVersion(databaseId: string) {
    const versions: number[] = []
    for (const collections of this.bootstrapCollections.values()) {
      if (collections.scope.databaseId !== databaseId) continue
      const version = collections.database._state.syncedData.get(databaseId)?.version
      if (version !== undefined) versions.push(version)
    }
    for (const resource of this.recordCollections.values()) {
      if (resource.scope.databaseId !== databaseId) continue
      const version = resource.getLatestWindow()?.databaseVersion
      if (version !== undefined) versions.push(version)
    }
    return versions.length ? Math.min(...versions) : 0
  }
}

function logRecordApplyFallback(
  event: DatabaseMutationEventV2,
  resource: DatabaseRecordCollection,
  outcome: "apply_failed" | "source_mismatch",
  error?: unknown,
) {
  console.warn(JSON.stringify({
    code: error instanceof Error ? error.name.slice(0, 64) : undefined,
    databaseId: event.databaseId,
    dataSourceId: resource.scope.dataSourceId,
    event: "database_realtime_collection_apply_fallback",
    eventId: event.eventId,
    outcome,
    version: event.version,
    viewId: resource.scope.viewId,
  }))
}

export function createDatabaseClient(options: DatabaseClientOptions) {
  return new SessionDatabaseClient(options)
}

function hasExplicitSort(config: unknown) {
  return Boolean(
    config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    Array.isArray((config as { sorts?: unknown }).sorts) &&
    (config as { sorts: unknown[] }).sorts.length > 0,
  )
}

function scopeMatches(
  candidate: DatabaseScope,
  requested: DatabaseScope,
) {
  return candidate.databaseId === requested.databaseId &&
    (requested.viewId == null || candidate.viewId === requested.viewId) &&
    (requested.includeDeleted === undefined ||
      (candidate.includeDeleted === true) === requested.includeDeleted)
}
