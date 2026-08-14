import assert from "node:assert/strict";
import { test } from "vitest";

import type { Database } from "../../db";
import {
  CORE_MIGRATION_SET,
  assertMigrationSets,
  runMigrationSets,
} from "./migrations";

test("migration sets run core first and keep separate journals", async () => {
  const calls: Array<{ folder: string; table: string }> = [];
  const enterprise = {
    id: "enterprise",
    journalTable: "__zilobase_enterprise_migrations",
    migrationsFolder: "/private/migrations",
  };

  await runMigrationSets(
    {} as Database,
    [CORE_MIGRATION_SET, enterprise],
    async (_database, config) => {
      calls.push({
        folder: config.migrationsFolder,
        table: config.migrationsTable,
      });
    },
  );

  assert.deepEqual(calls.map((call) => call.table), [
    "__zilobase_core_migrations",
    "__zilobase_enterprise_migrations",
  ]);
  assert.equal(calls[1]?.folder, "/private/migrations");
});

test("migration sets reject private-first and shared-journal configurations", () => {
  assert.throws(
    () =>
      assertMigrationSets([
        {
          id: "enterprise",
          journalTable: "__zilobase_enterprise_migrations",
          migrationsFolder: "/private",
        },
      ]),
    /core migration set must run first/,
  );
  assert.throws(
    () =>
      assertMigrationSets([
        CORE_MIGRATION_SET,
        {
          id: "enterprise",
          journalTable: CORE_MIGRATION_SET.journalTable,
          migrationsFolder: "/private",
        },
      ]),
    /distinct journals/,
  );
});
