import assert from "node:assert/strict"
import { test } from "vitest"
import {
  databaseMutationEventV2Fixture,
  databaseMutationEventV2Schema,
} from "@zilobase/features/databases/contracts"

import { databaseMutationEventFromJournalRow } from  "../realtime/journal-event"

test("the shared v2 event survives journal and runtime boundaries", () => {
  const fixture = databaseMutationEventV2Schema.parse(
    databaseMutationEventV2Fixture,
  )
  const restored = databaseMutationEventFromJournalRow({
    actorId: fixture.actorId,
    areas: fixture.areas,
    changes: fixture.changes,
    commandId: fixture.commandId,
    committedAt: new Date(fixture.committedAt),
    databaseId: fixture.databaseId,
    dataSourceId: fixture.dataSourceId,
    id: fixture.eventId,
    protocolVersion: fixture.protocolVersion,
    requiresReset: fixture.requiresReset === true,
    version: fixture.version,
  })

  assert.deepEqual(restored, fixture)
})
