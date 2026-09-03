import assert from "node:assert/strict";
import { test } from "vitest";

import type { Database } from "../database";
import {
  CORE_MIGRATION_SET,
  assertMigrationSets,
  runMigrationSets,
} from "./migrations";

test("migration sets run core first and keep separate journals", async () => {
  const calls: Array<{ folder: string; table: string }> = [];
  const statements: unknown[] = [];
  const extension = {
    id: "test-edition",
    journalTable: "__zilobase_test_edition_migrations",
    migrationsFolder: "/private/migrations",
  };

  await runMigrationSets(
    {
      execute: async (statement: unknown) => {
        statements.push(statement);
        return [];
      },
    } as unknown as Database,
    [CORE_MIGRATION_SET, extension],
    async (_database, config) => {
      calls.push({
        folder: config.migrationsFolder,
        table: config.migrationsTable,
      });
    },
  );

  assert.deepEqual(calls.map((call) => call.table), [
    "__zilobase_core_migrations",
    "__zilobase_test_edition_migrations",
  ]);
  assert.equal(calls[1]?.folder, "/private/migrations");
  assert.equal(statements.length, 3);
});

test("migration sets reject private-first and shared-journal configurations", () => {
  assert.throws(
    () =>
      assertMigrationSets([
        {
          id: "test-edition",
          journalTable: "__zilobase_test_edition_migrations",
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
          id: "test-edition",
          journalTable: CORE_MIGRATION_SET.journalTable,
          migrationsFolder: "/private",
        },
      ]),
    /distinct journals/,
  );
});
