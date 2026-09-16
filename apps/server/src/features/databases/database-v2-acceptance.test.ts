import assert from "node:assert/strict"
import { test } from "vitest"
import {
  databaseMutationEventV2Fixture,
  databaseMutationEventV2Schema,
  dataSourceMutationEventV3Schema,
} from "@zilobase/features/databases/contracts"

import {
  databaseMutationEventFromJournalRow,
  dataSourceMutationEventFromJournalRow,
} from "./realtime/journal-event"

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

test("the shared v3 source event survives journal and runtime boundaries", () => {
  const fixture = dataSourceMutationEventV3Schema.parse({
    actorId: "user-1",
    areas: ["records"],
    changes: { removedRecordIds: ["row-1"] },
    commandId: "command-1",
    committedAt: "2026-09-16T10:00:00.000Z",
    eventId: "event-1",
    protocolVersion: 3,
    sourceId: "source-1",
    sourceVersion: 7,
    type: "database.mutation",
  })
  const restored = dataSourceMutationEventFromJournalRow({
    actorId: fixture.actorId,
    areas: fixture.areas,
    changes: fixture.changes,
    commandId: fixture.commandId,
    committedAt: new Date(fixture.committedAt),
    id: fixture.eventId,
    protocolVersion: fixture.protocolVersion,
    requiresReset: fixture.requiresReset === true,
    sourceId: fixture.sourceId,
    version: fixture.sourceVersion,
  })

  assert.deepEqual(restored, fixture)
})
