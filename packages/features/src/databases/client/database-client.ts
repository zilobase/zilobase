import type { QueryClient } from "@tanstack/react-query"
import { DbClient as TanStackDbClient } from "@tanstack/react-db"

import type { ApiFetcher } from "../../shared/api-fetcher"
import type {
  DatabaseBootstrapResponse,
  DatabaseCommand,
  DatabaseMutationEventV2,
  DatabaseRecordEntity,
} from "../contracts-v2"
import {
  createDatabaseBootstrapCollections,
  databaseBootstrapQueryKey,
  readBootstrapCollectionStatus,
  type DatabaseBootstrapCollections,
} from "./bootstrap-collections"
import { databaseClientQueryRoot } from "./query-keys"
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
  hasMore: boolean
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
  private readonly queryClient: QueryClient

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
    return {
      ...readBootstrapCollectionStatus(
        collections,
        this.queryClient,
        queryKey,
      ),
      scope,
    }
  }

  records(scope: DatabaseViewScope): DatabaseRecordWindow {
    this.assertActive()
    return {
      error: null,
      hasMore: false,
      records: [],
      scope,
      status: "idle",
      totalCount: 0,
    }
  }

  execute<TResult>(
    _command: DatabaseClientCommand,
  ): DatabaseCommandTransaction<TResult> {
    this.assertActive()
    throw new Error("Database command execution is not initialized")
  }

  async ingest(_event: DatabaseMutationEventV2) {
    this.assertActive()
    throw new Error("Database realtime ingestion is not initialized")
  }

  async catchUp(_databaseId: string) {
    this.assertActive()
    throw new Error("Database mutation catch-up is not initialized")
  }

  async reset(_scope: DatabaseScope) {
    this.assertActive()
    throw new Error("Database collection reset is not initialized")
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
    this.queryClient.removeQueries({
      queryKey: [databaseClientQueryRoot, this.sessionId],
    })
  }

  private assertActive() {
    if (this.disposed) throw new Error("Database client session is disposed")
  }
}

export function createDatabaseClient(options: DatabaseClientOptions) {
  return new SessionDatabaseClient(options)
}
