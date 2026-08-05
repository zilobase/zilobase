import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { test } from "vitest";

import { upsertPagePropertyValues } from "./page-property-value-upsert";

function transactionRecorder() {
  const conflicts: unknown[] = [];
  const inserts: unknown[] = [];
  const transaction = {
    insert() {
      return {
        values(value: unknown) {
          inserts.push(value);
          return {
            async onConflictDoUpdate(options: unknown) {
              conflicts.push(options);
            },
          };
        },
      };
    },
  };

  return { conflicts, inserts, transaction };
}

test("upsertPagePropertyValues skips empty batches", async () => {
  const { inserts, transaction } = transactionRecorder();

  assert.equal(await upsertPagePropertyValues(transaction as never, []), 0);
  assert.equal(inserts.length, 0);
});

test("upsertPagePropertyValues deduplicates keys with last-value-wins semantics", async () => {
  const { conflicts, inserts, transaction } = transactionRecorder();
  const now = new Date("2026-01-01T00:00:00.000Z");

  const count = await upsertPagePropertyValues(transaction as never, [
    {
      id: "value-1",
      pageId: "page-1",
      propertyId: "property-1",
      updatedAt: now,
      value: "Original",
    },
    {
      id: "value-2",
      pageId: "page-1",
      propertyId: "property-2",
      updatedAt: now,
      value: "Second property",
    },
    {
      id: "value-3",
      pageId: "page-1",
      propertyId: "property-1",
      updatedAt: now,
      value: "Replacement",
    },
    {
      id: "value-4",
      pageId: "page-2",
      propertyId: "property-1",
      updatedAt: now,
      value: "Different page",
    },
  ]);

  assert.equal(count, 3);
  assert.equal(inserts.length, 1);
  assert.equal(conflicts.length, 1);
  const conflict = conflicts[0] as {
    set: { updatedAt: unknown; value: unknown };
  };
  const dialect = new PgDialect();
  assert.equal(
    dialect.sqlToQuery(conflict.set.updatedAt as never).sql,
    'excluded."updated_at"',
  );
  assert.equal(
    dialect.sqlToQuery(conflict.set.value as never).sql,
    'excluded."value"',
  );
  assert.deepEqual(
    (inserts[0] as Array<Record<string, unknown>>).map(
      ({ id, pageId, propertyId, value }) => ({
        id,
        pageId,
        propertyId,
        value,
      }),
    ),
    [
      {
        id: "value-3",
        pageId: "page-1",
        propertyId: "property-1",
        value: "Replacement",
      },
      {
        id: "value-2",
        pageId: "page-1",
        propertyId: "property-2",
        value: "Second property",
      },
      {
        id: "value-4",
        pageId: "page-2",
        propertyId: "property-1",
        value: "Different page",
      },
    ],
  );
});
