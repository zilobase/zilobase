import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

import type { Database } from "../../db";

export type MigrationSet = {
  id: string;
  journalTable: string;
  migrationsFolder: string;
};

export const CORE_MIGRATION_SET: MigrationSet = {
  id: "core",
  journalTable: "__zilobase_core_migrations",
  migrationsFolder: fileURLToPath(new URL("../../../drizzle", import.meta.url)),
};

type MigrationRunner = (
  database: Database,
  config: { migrationsFolder: string; migrationsTable: string },
) => Promise<void>;

export async function runMigrationSets(
  database: Database,
  migrationSets: readonly MigrationSet[],
  runner: MigrationRunner = migrate,
) {
  assertMigrationSets(migrationSets);

  await database.execute(
    sql`select pg_advisory_lock(hashtext('zilobase-database-migrations'))`,
  );

  try {
    await adoptLegacyCoreJournal(database);

    for (const migrationSet of migrationSets) {
      await runner(database, {
        migrationsFolder: migrationSet.migrationsFolder,
        migrationsTable: migrationSet.journalTable,
      });
    }
  } finally {
    await database.execute(
      sql`select pg_advisory_unlock(hashtext('zilobase-database-migrations'))`,
    );
  }
}

async function adoptLegacyCoreJournal(database: Database) {
  await database.execute(sql.raw(`
    do $$
    begin
      if to_regclass('drizzle.__zilobase_core_migrations') is null
        and to_regclass('drizzle.__drizzle_migrations') is not null then
        alter table drizzle.__drizzle_migrations
          rename to __zilobase_core_migrations;
      end if;
    end
    $$;
  `));
}

export function assertMigrationSets(migrationSets: readonly MigrationSet[]) {
  const ids = new Set<string>();
  const journalTables = new Set<string>();

  for (const migrationSet of migrationSets) {
    if (!/^[a-z][a-z0-9-]*$/.test(migrationSet.id)) {
      throw new Error(`Invalid migration set id: ${migrationSet.id}`);
    }

    if (!/^__[a-z][a-z0-9_]*_migrations$/.test(migrationSet.journalTable)) {
      throw new Error(
        `Invalid migration journal table: ${migrationSet.journalTable}`,
      );
    }

    if (ids.has(migrationSet.id)) {
      throw new Error(`Duplicate migration set id: ${migrationSet.id}`);
    }

    if (journalTables.has(migrationSet.journalTable)) {
      throw new Error(
        `Migration sets must use distinct journals: ${migrationSet.journalTable}`,
      );
    }

    ids.add(migrationSet.id);
    journalTables.add(migrationSet.journalTable);
  }

  if (migrationSets[0]?.id !== "core") {
    throw new Error("The core migration set must run first");
  }
}
