import type {
  DatabaseCommandAck,
  DatabaseMutationEventV2,
} from "./contracts-v2"

export const databaseMutationEventV2Fixture = {
  actorId: "fixture-user",
  areas: ["records"],
  changes: { removedRecordIds: ["fixture-row"] },
  commandId: "fixture-command",
  committedAt: "2026-09-14T00:00:00.000Z",
  databaseId: "fixture-database",
  dataSourceId: "fixture-source",
  eventId: "fixture-event",
  protocolVersion: 2,
  type: "database.mutation",
  version: 7,
} as const satisfies DatabaseMutationEventV2

export const databaseCommandAckV2Fixture = {
  commandId: databaseMutationEventV2Fixture.commandId,
  event: databaseMutationEventV2Fixture,
  result: { recordId: "fixture-row" },
} as const satisfies DatabaseCommandAck<{ recordId: string }>
