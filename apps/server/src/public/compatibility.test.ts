import assert from "node:assert/strict";
import { test } from "vitest";

import * as rootApi from "@zilobase/server";
import * as adapterApi from "@zilobase/server/adapter-api";
import * as nodeAdapterApi from "@zilobase/server/node-adapter-api";
import * as realtimeApi from "@zilobase/server/realtime-api";

test("external consumer entrypoints retain their runtime exports", () => {
  assertExports(rootApi, [
    "createApp",
    "createAuth",
    "MembershipService",
    "TeamspaceService",
    "setRuntimeAdapter",
  ]);
  assertExports(adapterApi, [
    "createApp",
    "runAiChatTurn",
    "createCollaborationHocuspocus",
    "drainDatabaseAutomationRuns",
    "drainMailDatabaseSyncOutbox",
  ]);
  assertExports(nodeAdapterApi, [
    "CORE_MIGRATION_SET",
    "assertMigrationSets",
    "createNodeRuntime",
    "runMigrationSets",
  ]);
  assertExports(realtimeApi, [
    "DATABASE_REALTIME_PROTOCOL",
    "MAIL_REALTIME_PROTOCOL",
    "MEETING_AUDIO_PROTOCOL",
    "NAVIGATION_REALTIME_PROTOCOL",
    "verifyDatabaseRealtimeTicket",
  ]);
});

function assertExports(module: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    assert.ok(name in module, `missing public export ${name}`);
  }
}
