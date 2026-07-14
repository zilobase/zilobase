import assert from "node:assert/strict";
import test from "node:test";

import {
  createDatabaseRealtimeTicket,
  verifyDatabaseRealtimeTicket,
} from "./database-realtime-ticket";

const env = { COLLABORATION_SECRET: "database-realtime-test-secret" };

test("database realtime tickets preserve scope, identity, and edit capability", async () => {
  const ticket = await createDatabaseRealtimeTicket(
    {
      canEdit: true,
      databaseId: "database-1",
      sessionId: "session-1",
      user: {
        email: "user@example.com",
        id: "user-1",
        name: "User One",
      },
      version: 7,
      workspaceId: "workspace-1",
    },
    env,
  );
  const claims = await verifyDatabaseRealtimeTicket(ticket.token, env);

  assert.equal(claims.canEdit, true);
  assert.equal(claims.databaseId, "database-1");
  assert.equal(claims.sessionId, "session-1");
  assert.equal(claims.user.id, "user-1");
  assert.equal(claims.version, 7);
  assert.equal(claims.workspaceId, "workspace-1");
});

test("database realtime tickets reject tampering", async () => {
  const { token } = await createDatabaseRealtimeTicket(
    {
      canEdit: false,
      databaseId: "database-1",
      user: { id: "user-1", name: "User One" },
      version: 7,
      workspaceId: "workspace-1",
    },
    env,
  );

  await assert.rejects(
    verifyDatabaseRealtimeTicket(`${token.slice(0, -1)}x`, env),
    /Invalid database realtime ticket/,
  );
});
