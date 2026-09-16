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
  DatabaseCommandExecutionAck,
  DatabaseCommandRequest,
  DatabaseInitialPageSize,
  DatabaseMutationEventV2,
  DatabaseMutationFeedResponse,
  DatabaseRecordEntity,
  DataSourceMutationEventV3,
  DataSourceMutationFeedResponseV3,
} from "../contracts-v2"
import {
  databaseCommandExecutionAckSchema,
  databaseMutationEventV2Schema,
  databaseMutationFeedResponseSchema,
  dataSourceMutationEventV3Schema,
  dataSourceMutationFeedResponseV3Schema,
} from "../contracts-v2"
import { getDatabaseInitialPageSize } from "../view-evaluation"
import { databaseContextExportRootQueryKey } from "../queries"
import {
  emitDatabaseMetric,
  type DatabaseMetricReason,
} from "../telemetry"
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
  ingest(event: DatabaseMutationEventV2 | DataSourceMutationEventV3): Promise<void>
  catchUp(sourceId: string): Promise<void>
  reset(scope: DatabaseScope): Promise<void>
}

type DatabaseClientOptions = {
  apiFetch: ApiFetcher
  queryClient: QueryClient
  sessionId: string
}

type DatabaseVersionLedger = {
  commandIds: Set<string>
  eventIds: Set<string>
  version: number
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
  private readonly commandStateListeners = new Map<string, Set<() => void>>()
  private readonly commandStates = new Map<string, DatabaseEntityCommandState>()
  private readonly cleanups = new Set<() => Promise<void> | void>()
  private disposed = false
  private readonly ingestionTails = new Map<string, Promise<void>>()
  private readonly queryClient: QueryClient
  private readonly recordCollections = new Map<string, DatabaseRecordCollection>()
  private readonly sourceVersions = new Map<string, DatabaseVersionLedger>()
  private readonly versions = new Map<string, DatabaseVersionLedger>()

  constructor({ apiFetch, queryClient, sessionId }: DatabaseClientOptions) {
    this.apiFetch = apiFetch
    this.queryClient = queryClient
    this.sessionId = sessionId
    this.tanstack = new TanStackDbClient({ queryClient })
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
    if (state.data) this.observeVersion(scope.databaseId, state.data.database.version)
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
    return this.commandStates.get(commandTargetKey(target)) ?? idleCommandState
  }

  subscribeCommandState(
    target: DatabaseCommandTarget,
    listener: () => void,
  ) {
    this.assertActive()
    const key = commandTargetKey(target)
    let listeners = this.commandStateListeners.get(key)
    if (!listeners) {
      listeners = new Set()
      this.commandStateListeners.set(key, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners?.delete(listener)
      if (listeners?.size === 0) this.commandStateListeners.delete(key)
    }
  }

  async ingest(input: DatabaseMutationEventV2 | DataSourceMutationEventV3) {
    this.assertActive()
    if (input.protocolVersion === 3) {
      const event = dataSourceMutationEventV3Schema.parse(input)
      await this.enqueueIngestion(`source:${event.sourceId}`, () =>
        this.ingestSourceNow(event))
      return
    }
    const event = databaseMutationEventV2Schema.parse(input)
    await this.enqueueIngestion(`host:${event.databaseId}`, () =>
      this.ingestNow(event))
  }

  async catchUp(sourceId: string) {
    this.assertActive()
    await this.enqueueIngestion(`source:${sourceId}`, () =>
      this.catchUpSourceNow(sourceId))
  }

  async reset(scope: DatabaseScope) {
    this.assertActive()
    await this.enqueueIngestion(scope.databaseId, async () => {
      await this.resetNow(scope)
      const ledger = this.ledger(scope.databaseId)
      ledger.version = this.loadedVersion(scope.databaseId)
      ledger.commandIds.clear()
      ledger.eventIds.clear()
    })
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
    this.commandStateListeners.clear()
    this.commandStates.clear()
    this.ingestionTails.clear()
    this.recordCollections.clear()
    this.sourceVersions.clear()
    this.versions.clear()
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
    const startedAt = performance.now()
    const request: DatabaseCommandRequest = {
      command: input.command,
      commandId,
      protocolVersion: 2,
    }
    const endpoint = input.dataSourceId
      ? `/databases/${encodeURIComponent(input.databaseId)}` +
        `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands`
      : `/databases/${encodeURIComponent(input.databaseId)}/commands`
    try {
      const response = databaseCommandExecutionAckSchema.parse(
        await this.apiFetch<DatabaseCommandExecutionAck>(endpoint, {
          body: JSON.stringify(request),
          method: "POST",
        }),
      )
      if (response.commandId !== commandId) {
        throw new Error("Database command acknowledgement ID does not match")
      }
      const scopeMatches = response.event.protocolVersion === 3
        ? Boolean(
            input.dataSourceId &&
            response.event.sourceId === input.dataSourceId,
          )
        : !input.dataSourceId && response.event.databaseId === input.databaseId
      if (!scopeMatches) {
        throw new Error("Database command acknowledgement scope does not match")
      }
      await this.ingest(response.event)
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
    const targets = commandTargets(input)
    for (const target of targets) this.updateCommandState(target, 1, null)
    return promise.then(
      (result) => {
        for (const target of targets) this.updateCommandState(target, -1, null)
        return result
      },
      (cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        for (const target of targets) this.updateCommandState(target, -1, error)
        emitDatabaseMetric("rollback", 1, "failure", "command_failure")
        throw cause
      },
    )
  }

  private updateCommandState(
    target: DatabaseCommandTarget,
    pendingDelta: number,
    error: Error | null,
  ) {
    const key = commandTargetKey(target)
    const previous = this.commandStates.get(key) ?? idleCommandState
    const pendingCount = Math.max(0, previous.pendingCount + pendingDelta)
    this.commandStates.set(key, {
      error,
      isPending: pendingCount > 0,
      pendingCount,
    })
    for (const listener of this.commandStateListeners.get(key) ?? []) listener()
  }

  private enqueueIngestion(databaseId: string, work: () => Promise<void>) {
    const previous = this.ingestionTails.get(databaseId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(work)
    this.ingestionTails.set(databaseId, next)
    return next.finally(() => {
      if (this.ingestionTails.get(databaseId) === next) {
        this.ingestionTails.delete(databaseId)
      }
    })
  }

  private async ingestNow(event: DatabaseMutationEventV2) {
    const ledger = this.ledger(event.databaseId)
    this.observeVersion(event.databaseId, this.loadedVersion(event.databaseId))
    if (
      ledger.eventIds.has(event.eventId) ||
      event.version <= ledger.version
    ) return

    if (event.version > ledger.version + 1) {
      emitDatabaseMetric("gap_recovery", 1, "success", "event_gap")
      await this.catchUpNow(event.databaseId)
    }
    if (event.version <= ledger.version) return
    if (event.version !== ledger.version + 1) {
      await this.resetNow({ databaseId: event.databaseId }, "invalid_history")
      ledger.version = Math.max(
        event.version,
        this.loadedVersion(event.databaseId),
      )
      this.rememberEvent(ledger, event)
      return
    }
    await this.applyEvent(event, ledger)
  }

  private async ingestSourceNow(event: DataSourceMutationEventV3) {
    const ledger = this.sourceLedger(event.sourceId)
    this.observeSourceVersion(
      event.sourceId,
      this.loadedSourceVersion(event.sourceId),
    )
    if (
      ledger.eventIds.has(event.eventId) ||
      event.sourceVersion <= ledger.version
    ) return

    if (event.sourceVersion > ledger.version + 1) {
      emitDatabaseMetric("gap_recovery", 1, "success", "event_gap")
      await this.catchUpSourceNow(event.sourceId)
    }
    if (event.sourceVersion <= ledger.version) return
    if (event.sourceVersion !== ledger.version + 1) {
      await this.resetSourceNow(event.sourceId, "invalid_history")
      ledger.version = Math.max(
        event.sourceVersion,
        this.loadedSourceVersion(event.sourceId),
      )
      this.rememberSourceEvent(ledger, event)
      return
    }
    await this.applySourceEvent(event, ledger)
  }

  private async catchUpSourceNow(sourceId: string) {
    const ledger = this.sourceLedger(sourceId)
    this.observeSourceVersion(sourceId, this.loadedSourceVersion(sourceId))
    while (true) {
      const response = dataSourceMutationFeedResponseV3Schema.parse(
        await this.apiFetch<DataSourceMutationFeedResponseV3>(
          `/data-sources/${encodeURIComponent(sourceId)}` +
            `/mutations?afterVersion=${ledger.version}&limit=500`,
        ),
      )
      if (response.resetRequired) {
        await this.resetSourceNow(sourceId, "expired_history")
        ledger.version = Math.max(
          response.latestSourceVersion,
          this.loadedSourceVersion(sourceId),
        )
        ledger.commandIds.clear()
        ledger.eventIds.clear()
        return
      }
      if (response.events.length === 0 && response.hasMore) {
        await this.resetSourceNow(sourceId, "invalid_history")
        ledger.version = response.latestSourceVersion
        return
      }
      for (const event of response.events) {
        if (event.sourceId !== sourceId) {
          await this.resetSourceNow(sourceId, "invalid_history")
          ledger.version = response.latestSourceVersion
          return
        }
        if (event.sourceVersion <= ledger.version) continue
        if (event.sourceVersion !== ledger.version + 1) {
          await this.resetSourceNow(sourceId, "invalid_history")
          ledger.version = response.latestSourceVersion
          return
        }
        await this.applySourceEvent(event, ledger)
      }
      if (!response.hasMore) return
    }
  }

  private async catchUpNow(databaseId: string) {
    const ledger = this.ledger(databaseId)
    this.observeVersion(databaseId, this.loadedVersion(databaseId))
    while (true) {
      const response = databaseMutationFeedResponseSchema.parse(
        await this.apiFetch<DatabaseMutationFeedResponse>(
          `/databases/${encodeURIComponent(databaseId)}` +
            `/mutations?afterVersion=${ledger.version}&limit=500`,
        ),
      )
      if (response.resetRequired) {
        await this.resetNow({ databaseId }, "expired_history")
        ledger.version = Math.max(
          response.latestVersion,
          this.loadedVersion(databaseId),
        )
        ledger.commandIds.clear()
        ledger.eventIds.clear()
        return
      }
      if (response.events.length === 0 && response.hasMore) {
        await this.resetNow({ databaseId }, "invalid_history")
        ledger.version = response.latestVersion
        return
      }
      for (const event of response.events) {
        if (event.databaseId !== databaseId) {
          await this.resetNow({ databaseId }, "invalid_history")
          ledger.version = response.latestVersion
          return
        }
        if (event.version <= ledger.version) continue
        if (event.version !== ledger.version + 1) {
          await this.resetNow({ databaseId }, "invalid_history")
          ledger.version = response.latestVersion
          return
        }
        await this.applyEvent(event, ledger)
      }
      if (!response.hasMore) return
    }
  }

  private async applyEvent(
    event: DatabaseMutationEventV2,
    ledger: DatabaseVersionLedger,
  ) {
    applyDatabaseMutationToPageProperties(this.queryClient, event)
    if (event.requiresReset) {
      await this.resetNow({ databaseId: event.databaseId }, "event_reset")
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
    ledger.version = event.requiresReset
      ? Math.max(event.version, this.loadedVersion(event.databaseId))
      : event.version
    this.rememberEvent(ledger, event)
    void this.queryClient.invalidateQueries({
      queryKey: databaseContextExportRootQueryKey(event.databaseId),
    })
  }

  private async applySourceEvent(
    event: DataSourceMutationEventV3,
    ledger: DatabaseVersionLedger,
  ) {
    this.settleCellOverlay(event.commandId)
    if (event.requiresReset) {
      await this.resetSourceNow(event.sourceId, "event_reset")
    } else {
      for (const collections of this.bootstrapCollections.values()) {
        collections.applySource(event)
      }
      for (const resource of this.recordCollections.values()) {
        if (resource.scope.dataSourceId !== event.sourceId) continue
        try {
          const outcome = resource.apply(
            event,
            this.shouldOrderByKey(resource.scope),
          )
          if (outcome === "source_mismatch") {
            logSourceRecordApplyIgnored(event, resource)
          }
        } catch (error) {
          logSourceRecordApplyFailure(event, resource, error)
          await resource.reset()
        }
      }
    }
    ledger.version = event.requiresReset
      ? Math.max(
          event.sourceVersion,
          this.loadedSourceVersion(event.sourceId),
        )
      : event.sourceVersion
    this.rememberSourceEvent(ledger, event)
    for (const collections of this.bootstrapCollections.values()) {
      if (!collections.dataSources.state.has(event.sourceId)) continue
      void this.queryClient.invalidateQueries({
        queryKey: databaseContextExportRootQueryKey(
          collections.scope.databaseId,
        ),
      })
    }
  }

  private async resetNow(
    scope: DatabaseScope,
    reason: DatabaseMetricReason = "manual",
  ) {
    emitDatabaseMetric("reset", 1, "success", reason)
    const work: Promise<void>[] = []
    for (const collections of this.bootstrapCollections.values()) {
      if (scopeMatches(collections.scope, scope)) {
        work.push(collections.refetch())
      }
    }
    for (const resource of this.recordCollections.values()) {
      if (scopeMatches(resource.scope, scope)) work.push(resource.reset())
    }
    await Promise.all(work)
  }

  private async resetSourceNow(
    sourceId: string,
    reason: DatabaseMetricReason,
  ) {
    emitDatabaseMetric("reset", 1, "success", reason)
    const work: Promise<void>[] = []
    for (const collections of this.bootstrapCollections.values()) {
      if (collections.dataSources.state.has(sourceId)) {
        work.push(collections.refetch())
      }
    }
    for (const resource of this.recordCollections.values()) {
      if (resource.scope.dataSourceId === sourceId) work.push(resource.reset())
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
    let version = 0
    for (const collections of this.bootstrapCollections.values()) {
      if (collections.scope.databaseId !== databaseId) continue
      version = Math.max(
        version,
        collections.database.state.get(databaseId)?.version ?? 0,
      )
    }
    for (const resource of this.recordCollections.values()) {
      if (resource.scope.databaseId !== databaseId) continue
      version = Math.max(
        version,
        resource.getLatestWindow()?.databaseVersion ?? 0,
      )
    }
    return version
  }

  private loadedSourceVersion(sourceId: string) {
    let version = 0
    for (const collections of this.bootstrapCollections.values()) {
      version = Math.max(
        version,
        collections.dataSources.state.get(sourceId)?.version ?? 0,
      )
    }
    for (const resource of this.recordCollections.values()) {
      if (resource.scope.dataSourceId !== sourceId) continue
      version = Math.max(
        version,
        resource.getLatestWindow()?.dataSourceVersion ?? 0,
      )
    }
    return version
  }

  private ledger(databaseId: string) {
    let ledger = this.versions.get(databaseId)
    if (!ledger) {
      ledger = {
        commandIds: new Set(),
        eventIds: new Set(),
        version: this.loadedVersion(databaseId),
      }
      this.versions.set(databaseId, ledger)
    }
    return ledger
  }

  private sourceLedger(sourceId: string) {
    let ledger = this.sourceVersions.get(sourceId)
    if (!ledger) {
      ledger = {
        commandIds: new Set(),
        eventIds: new Set(),
        version: this.loadedSourceVersion(sourceId),
      }
      this.sourceVersions.set(sourceId, ledger)
    }
    return ledger
  }

  private observeVersion(databaseId: string, version: number) {
    const ledger = this.ledger(databaseId)
    ledger.version = Math.max(ledger.version, version)
  }

  private observeSourceVersion(sourceId: string, version: number) {
    const ledger = this.sourceLedger(sourceId)
    ledger.version = Math.max(ledger.version, version)
  }

  private rememberEvent(
    ledger: DatabaseVersionLedger,
    event: DatabaseMutationEventV2,
  ) {
    rememberBounded(ledger.eventIds, event.eventId)
    rememberBounded(ledger.commandIds, event.commandId)
  }

  private rememberSourceEvent(
    ledger: DatabaseVersionLedger,
    event: DataSourceMutationEventV3,
  ) {
    rememberBounded(ledger.eventIds, event.eventId)
    rememberBounded(ledger.commandIds, event.commandId)
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

function logSourceRecordApplyIgnored(
  event: DataSourceMutationEventV3,
  resource: DatabaseRecordCollection,
) {
  console.info(JSON.stringify({
    dataSourceId: resource.scope.dataSourceId,
    event: "database_realtime_collection_event_ignored",
    eventId: event.eventId,
    outcome: "source_mismatch",
    sourceId: event.sourceId,
    sourceVersion: event.sourceVersion,
    viewId: resource.scope.viewId,
  }))
}

function logSourceRecordApplyFailure(
  event: DataSourceMutationEventV3,
  resource: DatabaseRecordCollection,
  error: unknown,
) {
  console.warn(JSON.stringify({
    code: error instanceof Error ? error.name.slice(0, 64) : undefined,
    dataSourceId: resource.scope.dataSourceId,
    event: "database_realtime_collection_apply_fallback",
    eventId: event.eventId,
    outcome: "apply_failed",
    sourceId: event.sourceId,
    sourceVersion: event.sourceVersion,
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

function rememberBounded(values: Set<string>, value: string) {
  values.add(value)
  if (values.size <= 2_048) return
  const oldest = values.values().next().value
  if (oldest) values.delete(oldest)
}

const idleCommandState: DatabaseEntityCommandState = Object.freeze({
  error: null,
  isPending: false,
  pendingCount: 0,
})

function commandTargetKey(target: DatabaseCommandTarget) {
  return JSON.stringify([
    target.hostDatabaseId ?? null,
    target.dataSourceId ?? null,
    target.viewId ?? null,
    target.rowId ?? null,
    target.propertyId ?? null,
  ])
}

function commandTargets(input: DatabaseClientCommand): DatabaseCommandTarget[] {
  const dataSourceId = input.dataSourceId
  const command = input.command
  if (!dataSourceId) {
    if (command.type === "database.update") {
      return [{ hostDatabaseId: input.databaseId }]
    }
    if (command.type.startsWith("view.") && "viewId" in command) {
      return [
        { hostDatabaseId: input.databaseId },
        { hostDatabaseId: input.databaseId, viewId: command.viewId },
      ]
    }
    if (command.type === "view.create") {
      return [{ hostDatabaseId: input.databaseId }]
    }
    if (
      command.type === "dataSource.link" ||
      command.type === "dataSource.unlink"
    ) {
      return [
        { hostDatabaseId: input.databaseId },
        { dataSourceId: command.dataSourceId },
      ]
    }
    return []
  }
  if (command.type === "cell.set") {
    return [
      { dataSourceId },
      { dataSourceId, rowId: command.rowId },
      {
        dataSourceId,
        propertyId: command.propertyId,
        rowId: command.rowId,
      },
    ]
  }
  if ("rowId" in command && typeof command.rowId === "string") {
    return [{ dataSourceId }, { dataSourceId, rowId: command.rowId }]
  }
  if ("propertyId" in command && typeof command.propertyId === "string") {
    return [
      { dataSourceId },
      { dataSourceId, propertyId: command.propertyId },
    ]
  }
  return [{ dataSourceId }]
}
