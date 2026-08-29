import assert from "node:assert/strict"
import { test } from "vitest"

import { getDataSourceRecord } from "./data-source-access"

function dataSourceReader(results: unknown[][]) {
  let selects = 0;
  const executor = {
    select() {
      selects += 1;
      const rows = results.shift() ?? []
      const builder = {
        from() {
          return builder
        },
        where() {
          return builder
        },
        async limit() {
          return rows
        },
      }
      return builder
    },
  }

  return { executor, getSelectCount: () => selects }
}

test("getDataSourceRecord resolves only canonical data source ids", async () => {
  const reader = dataSourceReader([[]])

  const result = await getDataSourceRecord("database-1", {
    executor: reader.executor as never,
  })

  assert.equal(result, undefined)
  assert.equal(reader.getSelectCount(), 1)
})
