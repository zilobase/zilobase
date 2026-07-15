import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDbClientForUrl } from "../db";

const databaseUrl = readRequiredEnv("DATABASE_URL");
const migrationsFolder =
  process.env.DRIZZLE_MIGRATIONS_DIR ??
  fileURLToPath(new URL("../../drizzle", import.meta.url));

main().catch((error) => {
  console.error("Notelab database migrations failed", error);
  process.exit(1);
});

async function main() {
  const dbClient = createDbClientForUrl(databaseUrl);

  console.info(`Running Notelab database migrations from ${migrationsFolder}`);

  await dbClient.client.connect();

  try {
    await migrate(dbClient.db, { migrationsFolder });
    console.info("Notelab database migrations complete");
  } finally {
    await dbClient.client.end();
  }
}

function readRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}
