import { fileURLToPath } from "node:url";
import { createDbClientForUrl } from "../infrastructure/database";
import {
  CORE_MIGRATION_SET,
  runMigrationSets,
  type MigrationSet,
} from "../infrastructure/node/migrations";

const databaseUrl = readRequiredEnv("DATABASE_URL");
const migrationsFolder =
  process.env.DRIZZLE_MIGRATIONS_DIR ??
  fileURLToPath(new URL("../../drizzle", import.meta.url));
const migrationSets: MigrationSet[] = [
  { ...CORE_MIGRATION_SET, migrationsFolder },
];
const editionMigrationsFolder = process.env.ZILOBASE_EDITION_MIGRATIONS_DIR;

if (editionMigrationsFolder) {
  migrationSets.push({
    id: "enterprise",
    journalTable: "__zilobase_enterprise_migrations",
    migrationsFolder: editionMigrationsFolder,
  });
}

main().catch((error) => {
  console.error("Zilobase database migrations failed", error);
  process.exit(1);
});

async function main() {
  const dbClient = createDbClientForUrl(databaseUrl);

  console.info(
    `Running Zilobase database migration sets: ${migrationSets
      .map((migrationSet) => migrationSet.id)
      .join(", ")}`,
  );

  await dbClient.client.connect();

  try {
    await runMigrationSets(dbClient.db, migrationSets);
    console.info("Zilobase database migrations complete");
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
