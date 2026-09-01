import assert from "node:assert/strict"
import test from "node:test"

import type { DatabaseProperty } from "../queries"
import { evaluateDatabaseFormula } from "./evaluator"

const row = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "row-1",
  page: { name: "Launch" },
  pageId: "page-1",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function property(id: string, name: string, type: string, config?: unknown): DatabaseProperty {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    dataSourceId: "source-1",
    id: `wrapper-${id}`,
    position: 0,
    property: {
      config,
      createdAt: "2026-01-01T00:00:00.000Z",
      id,
      name,
      type,
      updatedAt: "2026-01-01T00:00:00.000Z",
      workspaceId: "workspace-1",
    },
    propertyId: id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    visible: true,
  }
}

const score = property("score", "Score", "number")
const doubled = property("doubled", "Doubled", "formula", { formula: "Score * 2" })
const baseContext = {
  properties: [score, doubled],
  propertyValuesByKey: { "page-1:score": "4" },
  row,
  titlePropertyLabel: "Name",
}

test("evaluates properties, referenced formulas, variables, and list functions", () => {
  assert.deepEqual(
    evaluateDatabaseFormula({
      ...baseContext,
      expression: "Doubled + offset + sum([1, 1, 2].unique())",
      variables: { offset: 3 },
    }),
    { ok: true, type: "number", value: 14 },
  )
})

test("uses one injected clock instant for now and today", () => {
  const now = new Date("2026-03-08T04:30:00.123Z")
  const current = evaluateDatabaseFormula({ ...baseContext, expression: "now()", now })
  const today = evaluateDatabaseFormula({
    ...baseContext,
    expression: "today()",
    now,
    timezone: "America/New_York",
  })

  assert.equal(current.ok && current.value instanceof Date ? current.value.toISOString() : null, now.toISOString())
  assert.equal(today.ok && today.value instanceof Date ? today.value.toISOString() : null, "2026-03-07T05:00:00.000Z")
})

test("extracts date parts in the requested timezone and rejects invalid zones", () => {
  const instant = new Date("2026-01-01T00:30:00.000Z")
  assert.deepEqual(
    evaluateDatabaseFormula({
      ...baseContext,
      expression: "year(instant) * 100 + month(instant)",
      timezone: "America/Los_Angeles",
      variables: { instant },
    }),
    { ok: true, type: "number", value: 202512 },
  )

  const invalid = evaluateDatabaseFormula({
    ...baseContext,
    expression: "today()",
    timezone: "Mars/Olympus_Mons",
  })
  assert.equal(invalid.ok, false)
  assert.match(invalid.ok ? "" : invalid.error, /Invalid IANA timezone/)
})

test("returns deterministic parser errors instead of throwing", () => {
  const result = evaluateDatabaseFormula({ ...baseContext, expression: "if(" })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.error.length > 0)
})
