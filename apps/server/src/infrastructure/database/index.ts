import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool } from "pg";
import { getDatabaseUrl } from "@zilobase/runtime-adapter/capabilities";
import * as schema from "./schema";

type DbEnv = Record<string, unknown>;
type Database = NodePgDatabase<typeof schema>;
type DatabaseScope = {
  active: boolean;
  database: Database;
};
type DatabaseClient =
  | ReturnType<typeof createDbClientForUrl>
  | ReturnType<typeof createPooledDbClientForUrl>;

const databaseStore = new AsyncLocalStorage<DatabaseScope>();
const authTransactionStore = new AsyncLocalStorage<Database>();
const pools = new Map<string, Pool>();

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const scope = databaseStore.getStore();

    if (!scope?.active) {
      throw new Error("No database context found. Wrap this code in runWithDb().");
    }

    return Reflect.get(scope.database, property, receiver);
  },
});

export function createDbClient(env: DbEnv) {
  const connectionString = getConnectionString(env);

  return env.ZILOBASE_RUNTIME_KIND === "worker"
    ? createDbClientForUrl(connectionString, { queryTimeoutMillis: 15_000 })
    : createPooledDbClientForUrl(connectionString);
}

/**
 * Better Auth deliberately exposes only its adapter inside a transaction.
 * Edition extensions also need the exact Drizzle transaction so related
 * and assurance writes commit with the Better Auth user, account, and session.
 */
export function createAuthTransactionDatabase(database: Database): Database {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "transaction") {
        return Reflect.get(target, property, receiver);
      }

      return async <T>(
        callback: (transaction: Database) => Promise<T>,
        ...args: unknown[]
      ) => {
        const transaction = Reflect.get(target, property, receiver) as (
          callback: (transaction: Database) => Promise<T>,
          ...args: unknown[]
        ) => Promise<T>;
        return transaction.call(
          target,
          (activeDatabase: Database) =>
            authTransactionStore.run(activeDatabase, () => callback(activeDatabase)),
          ...args,
        );
      };
    },
  });
}

export function getCurrentExtensionTransactionDatabase(): Database {
  const database = authTransactionStore.getStore();
  if (!database) {
    const error = new Error(
      "EXTENSION_TRANSACTION_UNAVAILABLE: no authentication transaction is active.",
    );
    error.name = "ExtensionTransactionUnavailableError";
    throw error;
  }
  return database;
}

export function createDbClientForUrl(
  connectionString: string,
  options: { queryTimeoutMillis?: number } = {},
) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
    ...(options.queryTimeoutMillis
      ? { query_timeout: options.queryTimeoutMillis }
      : {}),
    ...(usesLocalSslProxy(connectionString)
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  // pg rejects pending operations, but also emits errors when the connection
  // dies between queries. Handle those events before connect/LISTEN can run.
  client.on("error", () => {
    console.warn(JSON.stringify({
      event: "database.connection",
      outcome: "failed",
    }));
  });

  return {
    client,
    db: drizzle(client, { schema }),
    lifecycle: "standalone" as const,
  };
}

function createPooledDbClientForUrl(connectionString: string) {
  let pool = pools.get(connectionString);

  if (!pool) {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
      max: 10,
      allowExitOnIdle: true,
      ...(usesLocalSslProxy(connectionString)
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    });
    pool.on("error", (error) => {
      console.error("Unexpected idle PostgreSQL connection error", error);
    });
    pools.set(connectionString, pool);
  }

  return {
    client: pool,
    db: drizzle(pool, { schema }),
    lifecycle: "pooled" as const,
  };
}

export async function runWithDb<T>(database: Database, callback: () => Promise<T>) {
  const scope: DatabaseScope = { active: true, database };

  try {
    return await databaseStore.run(scope, callback);
  } finally {
    scope.active = false;
  }
}

export async function runWithDbClient<T>(
  databaseClient: DatabaseClient,
  callback: () => Promise<T>,
  options?: { onTiming?: (name: string, durationMs: number) => void },
) {
  if (databaseStore.getStore()?.active) {
    return callback();
  }

  if (databaseClient.lifecycle === "pooled") {
    // Drizzle acquires and releases pool connections for the queries it runs.
    // Pre-acquiring a connection here only to release it before the callback
    // adds a pool round trip to every request without protecting any query.
    return runWithDb(databaseClient.db, callback);
  }

  const connectStartedAt = performance.now();
  await databaseClient.client.connect();
  options?.onTiming?.(
    "db_connect",
    Math.round(performance.now() - connectStartedAt),
  );

  try {
    return await runWithDb(databaseClient.db, callback);
  } finally {
    const endStartedAt = performance.now();
    await databaseClient.client.end();
    options?.onTiming?.(
      "db_end",
      Math.round(performance.now() - endStartedAt),
    );
  }
}

export function runWithDbEnv<T>(
  env: DbEnv,
  callback: () => Promise<T>,
  options?: { onTiming?: (name: string, durationMs: number) => void },
) {
  if (databaseStore.getStore()?.active) {
    return callback();
  }

  return runWithDbClient(createDbClient(env), callback, options);
}

/** Streaming responses outlive the request middleware and need their own scope. */
export function runWithIndependentDbEnv<T>(env: DbEnv, callback: () => Promise<T>) {
  return databaseStore.exit(() => runWithDbEnv(env, callback));
}

function hasDatabaseContext() {
  return databaseStore.getStore()?.active === true;
}

function getConnectionString(env: DbEnv) {
  const connectionString = getDatabaseUrl(env);

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return connectionString;
}

export type { Database, DatabaseClient };

function usesLocalSslProxy(url: string) {
  try {
    const parsed = new URL(url);

    return (
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) &&
      parsed.searchParams.get("sslmode") === "require"
    );
  } catch {
    return false;
  }
}
