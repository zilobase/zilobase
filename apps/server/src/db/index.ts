import { drizzle } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "pg";
import { getDatabaseUrl } from "../runtime-adapter";
import * as schema from "./schema";

type DbEnv = Record<string, unknown>;
type DatabaseClient = ReturnType<typeof createDbClientForUrl>;
type Database = DatabaseClient["db"];

const databaseStore = new AsyncLocalStorage<Database>();

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const database = databaseStore.getStore();

    if (!database) {
      throw new Error("No database context found. Wrap this code in runWithDb().");
    }

    return Reflect.get(database, property, receiver);
  },
});

export function createDbClient(env: DbEnv) {
  return createDbClientForUrl(getConnectionString(env));
}

export function createDbClientForUrl(connectionString: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
    ...(usesLocalSslProxy(connectionString)
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}

export async function runWithDb<T>(database: Database, callback: () => Promise<T>) {
  return databaseStore.run(database, callback);
}

export async function runWithDbClient<T>(
  databaseClient: DatabaseClient,
  callback: () => Promise<T>,
) {
  await databaseClient.client.connect();

  try {
    return await runWithDb(databaseClient.db, callback);
  } finally {
    await databaseClient.client.end();
  }
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
