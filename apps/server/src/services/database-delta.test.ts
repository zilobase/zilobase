import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DATABASE_REALTIME_DELTA_BYTES,
  prepareDatabaseRealtimeDelta,
  propertyPositionDelta,
  rowPositionDelta,
  toMutationResponse,
} from "./database-delta";

test("large realtime deltas become invalidate-only events", () => {
  const small = { database: { name: "Small" } };
  const large = {
    database: { value: "x".repeat(MAX_DATABASE_REALTIME_DELTA_BYTES) },
  };

  assert.deepEqual(prepareDatabaseRealtimeDelta(small), {
    requiresRefetch: false,
    value: small,
  });
  assert.deepEqual(prepareDatabaseRealtimeDelta(large), {
    requiresRefetch: true,
    value: {},
  });
});

test("propertyPositionDelta maps ids to zero-based positions", () => {
  assert.deepEqual(propertyPositionDelta(["prop-b", "prop-a", "prop-c"]), {
    properties: [
      { id: "prop-b", position: 0 },
      { id: "prop-a", position: 1 },
      { id: "prop-c", position: 2 },
    ],
  });
});

test("rowPositionDelta maps ids to zero-based positions", () => {
  assert.deepEqual(rowPositionDelta(["row-2", "row-1"]), {
    rows: [
      { id: "row-2", position: 0 },
      { id: "row-1", position: 1 },
    ],
  });
});

test("toMutationResponse combines event metadata with delta", () => {
  const response = toMutationResponse(
    {
      actorId: "user-1",
      changed: ["values"],
      committedAt: "2026-06-24T12:00:00.000Z",
      databaseId: "db-1",
      mutationId: "mutation-1",
      version: 7,
    },
    {
      values: [
        {
          propertyId: "property-1",
          updatedAt: "2026-06-24T12:00:00.000Z",
          value: "Done",
          pageId: "page-1",
        },
      ],
    },
  );

  assert.deepEqual(response, {
    changed: ["values"],
    committedAt: "2026-06-24T12:00:00.000Z",
    databaseId: "db-1",
    delta: {
      values: [
        {
          propertyId: "property-1",
          updatedAt: "2026-06-24T12:00:00.000Z",
          value: "Done",
          pageId: "page-1",
        },
      ],
    },
    mutationId: "mutation-1",
    version: 7,
  });
});
