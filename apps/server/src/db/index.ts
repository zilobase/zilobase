import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool } from "pg";
import { getDatabaseUrl, isSelfHostedRuntime } from "../runtime-adapter";
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

  return isSelfHostedRuntime()
    ? createPooledDbClientForUrl(connectionString)
    : createDbClientForUrl(connectionString, { queryTimeoutMillis: 15_000 });
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
