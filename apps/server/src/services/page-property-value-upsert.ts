import { sql } from "drizzle-orm";

import type { Database } from "../db";
import { pagePropertyValue } from "../db/schema";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PropertyValueInsert = typeof pagePropertyValue.$inferInsert;

export async function upsertPagePropertyValues(
  executor: DatabaseTransaction,
  values: PropertyValueInsert[],
) {
  const valuesByPage = new Map<string, Map<string, PropertyValueInsert>>();

  for (const value of values) {
    const pageValues = valuesByPage.get(value.pageId) ?? new Map();
    pageValues.set(value.propertyId, value);
    valuesByPage.set(value.pageId, pageValues);
  }

  const deduplicatedValues = [...valuesByPage.values()].flatMap((pageValues) =>
    [...pageValues.values()],
  );

  if (deduplicatedValues.length === 0) {
    return 0;
  }

  await executor
    .insert(pagePropertyValue)
    .values(deduplicatedValues)
    .onConflictDoUpdate({
      target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
      set: {
        updatedAt: sql`excluded.${sql.identifier(pagePropertyValue.updatedAt.name)}`,
        value: sql`excluded.${sql.identifier(pagePropertyValue.value.name)}`,
      },
    });

  return deduplicatedValues.length;
}
