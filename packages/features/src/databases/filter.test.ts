import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateDatabaseFilter,
  evaluateDatabaseFilters,
  getDatabaseFilterOperatorsForType,
  normalizeDatabaseFilters,
  type DatabasePredicateContext,
  type DatabasePropertyFilterConfig,
} from "./filter"

function context(
  values: Record<string, string[]>,
  types: Record<string, string> = {},
  options: Pick<DatabasePredicateContext, "now" | "timezone"> = {},
): DatabasePredicateContext {
  return {
    getPropertyType: (propertyId) => types[propertyId],
    getPropertyValues: (propertyId) => values[propertyId] ?? [],
    ...options,
  }
}

function filter(
  operator: DatabasePropertyFilterConfig["operator"],
  propertyId: string,
  values: string[],
): DatabasePropertyFilterConfig {
  return { id: `${propertyId}-${operator}`, operator, propertyId, values }
}

test("normalizes legacy title filters and bounds untrusted trees", () => {
  const nested = (depth: number): unknown => ({
    filters: depth > 0 ? [nested(depth - 1)] : [],
    operator: "and",
    type: "group",
  })
  const normalized = normalizeDatabaseFilters([
    { operator: "contains", propertyId: "title", values: [7, true] },
    nested(8),
    ...Array.from({ length: 110 }, () => ({
      operator: "is",
      propertyId: "name",
      values: ["x"],
    })),
  ])

  assert.equal(normalized.length, 100)
  assert.deepEqual(normalized[0], {
    id: "filter-0",
    joinOperator: undefined,
    operator: "contains",
    propertyId: "name",
    values: ["7", "true"],
  })
  let cursor: (typeof normalized)[number] | undefined = normalized[1]
  for (let depth = 0; depth < 6; depth += 1) {
    assert.equal(cursor && "type" in cursor ? cursor.type : null, "group")
    cursor = cursor && "type" in cursor ? cursor.filters[0] : undefined
  }
  assert.equal(cursor, undefined)
})

test("matches Unicode consistently and preserves null, zero, and false semantics", () => {
  const predicate = context(
    {
      checkbox: ["Unchecked"],
      emptyNumber: [],
      name: ["  Café Ａ  "],
      zero: ["0"],
    },
    { checkbox: "checkbox", emptyNumber: "number", zero: "number" },
  )

  assert.equal(evaluateDatabaseFilter(filter("is", "name", ["cafe\u0301 a"]), predicate), true)
  assert.equal(evaluateDatabaseFilter(filter("is", "zero", ["0"]), predicate), true)
  assert.equal(evaluateDatabaseFilter(filter("is_empty", "zero", []), predicate), false)
  assert.equal(evaluateDatabaseFilter(filter("is_empty", "emptyNumber", []), predicate), true)
  assert.equal(evaluateDatabaseFilter(filter("is", "checkbox", ["Unchecked"]), predicate), true)
})

test("evaluates mixed any/all groups with the same adapter on browser and server", () => {
  const filters = [
    filter("is", "status", ["Done"]),
    { ...filter("greater_than", "score", ["10"]), joinOperator: "or" as const },
    { ...filter("contains", "name", ["roadmap"]), joinOperator: "and" as const },
  ]
  const browser = context(
    { name: ["Q4 roadmap"], score: ["12"], status: ["Open"] },
    { score: "number", status: "select" },
  )
  const server = context(
    { name: ["Q4 roadmap"], score: ["12"], status: ["Open"] },
    { score: "number", status: "select" },
  )

  assert.equal(evaluateDatabaseFilters(filters, browser), true)
  assert.equal(evaluateDatabaseFilters(filters, server), true)
})

test("relative dates use the injected instant and IANA timezone across DST", () => {
  const now = new Date("2026-03-08T07:30:00.000Z")
  const predicate = context(
    { due: ["2026-03-08T16:00:00.000Z"] },
    { due: "date" },
    { now, timezone: "America/New_York" },
  )

  assert.equal(
    evaluateDatabaseFilter(
      filter("is_relative_to_today", "due", ["relative:this:day"]),
      predicate,
    ),
    true,
  )
  assert.throws(
    () => evaluateDatabaseFilter(filter("is", "due", ["2026-03-08"]), {
      ...predicate,
      timezone: "Mars/Olympus_Mons",
    }),
    /Invalid IANA timezone/,
  )
})

test("publishes the property-specific operator matrix", () => {
  assert.deepEqual(
    getDatabaseFilterOperatorsForType("checkbox").map(({ value }) => value),
    ["is", "is_not"],
  )
  assert.ok(
    getDatabaseFilterOperatorsForType("date").some(
      ({ value }) => value === "is_relative_to_today",
    ),
  )
})
