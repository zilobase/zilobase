import type { QueryClient } from "@tanstack/react-query"
import { DbClient as TanStackDbClient } from "@tanstack/react-db"

import type { ApiFetcher } from "../../shared/api-fetcher"
import type {
  DatabaseBootstrapResponse,
  DatabaseCommand,
  DatabaseCommandAck,
  DatabaseCommandRequest,
  DatabaseInitialPageSize,
  DatabaseMutationEventV2,
  DatabaseMutationFeedResponse,
  DatabaseRecordEntity,
} from "../contracts-v2"
import {
  databaseCommandAckSchema,
  databaseMutationEventV2Schema,
  databaseMutationFeedResponseSchema,
} from "../contracts-v2"
import { getDatabaseInitialPageSize } from "../view-evaluation"
import {
  createDatabaseBootstrapCollections,
  databaseBootstrapQueryKey,
  readBootstrapCollectionStatus,
  type DatabaseBootstrapCollections,
} from "./bootstrap-collections"
import { databaseClientQueryRoot } from "./query-keys"
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

export type DatabaseClient = {
  readonly sessionId: string
  bootstrap(scope: DatabaseScope): DatabaseBootstrapState
  records(scope: DatabaseViewScope): DatabaseRecordWindow
  execute<TResult>(
    command: DatabaseClientCommand,
  ): DatabaseCommandTransaction<TResult>
  ingest(event: DatabaseMutationEventV2): Promise<void>
  catchUp(databaseId: string): Promise<void>
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
  private readonly cleanups = new Set<() => Promise<void> | void>()
  private disposed = false
  private readonly ingestionTails = new Map<string, Promise<void>>()
  private readonly queryClient: QueryClient
  private readonly recordCollections = new Map<string, DatabaseRecordCollection>()
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
    const commandId = crypto.randomUUID()
    const request: DatabaseCommandRequest = {
      command: input.command,
      commandId,
      protocolVersion: 2,
    }
    const endpoint = input.dataSourceId
      ? `/databases/${encodeURIComponent(input.databaseId)}` +
        `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands`
      : `/databases/${encodeURIComponent(input.databaseId)}/commands`
    const promise = (async () => {
      const response = databaseCommandAckSchema.parse(
        await this.apiFetch<DatabaseCommandAck>(endpoint, {
          body: JSON.stringify(request),
          method: "POST",
        }),
      )
      if (response.commandId !== commandId) {
        throw new Error("Database command acknowledgement ID does not match")
      }
      if (
        response.event.databaseId !== input.databaseId ||
        (input.dataSourceId &&
          response.event.dataSourceId !== input.dataSourceId)
      ) {
        throw new Error("Database command acknowledgement scope does not match")
      }
      await this.ingest(response.event)
      return response.result as TResult
    })()
    return { commandId, promise }
  }

  async ingest(input: DatabaseMutationEventV2) {
    this.assertActive()
    const event = databaseMutationEventV2Schema.parse(input)
    await this.enqueueIngestion(event.databaseId, () => this.ingestNow(event))
  }

  async catchUp(databaseId: string) {
    this.assertActive()
    await this.enqueueIngestion(databaseId, () => this.catchUpNow(databaseId))
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
    this.ingestionTails.clear()
    this.recordCollections.clear()
    this.versions.clear()
    this.queryClient.removeQueries({
      queryKey: [databaseClientQueryRoot, this.sessionId],
    })
  }

  private assertActive() {
    if (this.disposed) throw new Error("Database client session is disposed")
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
      await this.catchUpNow(event.databaseId)
    }
    if (event.version <= ledger.version) return
    if (event.version !== ledger.version + 1) {
      await this.resetNow({ databaseId: event.databaseId })
      ledger.version = Math.max(
        event.version,
        this.loadedVersion(event.databaseId),
      )
      this.rememberEvent(ledger, event)
      return
    }
    await this.applyEvent(event, ledger)
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
        await this.resetNow({ databaseId })
        ledger.version = Math.max(
          response.latestVersion,
          this.loadedVersion(databaseId),
        )
        ledger.commandIds.clear()
        ledger.eventIds.clear()
        return
      }
      if (response.events.length === 0 && response.hasMore) {
        await this.resetNow({ databaseId })
        ledger.version = response.latestVersion
        return
      }
      for (const event of response.events) {
        if (event.databaseId !== databaseId) {
          await this.resetNow({ databaseId })
          ledger.version = response.latestVersion
          return
        }
        if (event.version <= ledger.version) continue
        if (event.version !== ledger.version + 1) {
          await this.resetNow({ databaseId })
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
    if (event.requiresReset) {
      await this.resetNow({ databaseId: event.databaseId })
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
          resource.apply(event, this.shouldOrderByKey(resource.scope))
        }
      }
    }
    ledger.version = event.requiresReset
      ? Math.max(event.version, this.loadedVersion(event.databaseId))
      : event.version
    this.rememberEvent(ledger, event)
  }

  private async resetNow(scope: DatabaseScope) {
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

  private observeVersion(databaseId: string, version: number) {
    const ledger = this.ledger(databaseId)
    ledger.version = Math.max(ledger.version, version)
  }

  private rememberEvent(
    ledger: DatabaseVersionLedger,
    event: DatabaseMutationEventV2,
  ) {
    rememberBounded(ledger.eventIds, event.eventId)
    rememberBounded(ledger.commandIds, event.commandId)
  }
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
