import assert from "node:assert/strict"
import { test } from "node:test"

import {
  databaseCommandAckSchema,
  databaseMutationEventV2Schema,
} from "./contracts-v2"
import {
  databaseCommandAckV2Fixture,
  databaseMutationEventV2Fixture,
} from "./contract-fixtures"

test("database v2 fixtures round-trip through runtime contracts", () => {
  assert.deepEqual(
    databaseMutationEventV2Schema.parse(
      JSON.parse(JSON.stringify(databaseMutationEventV2Fixture)),
    ),
    databaseMutationEventV2Fixture,
  )
  assert.deepEqual(
    databaseCommandAckSchema.parse(
      JSON.parse(JSON.stringify(databaseCommandAckV2Fixture)),
    ),
    databaseCommandAckV2Fixture,
  )
})
