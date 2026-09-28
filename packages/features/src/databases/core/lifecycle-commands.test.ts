import assert from "node:assert/strict";
import { test } from "node:test";
import {
  databaseCreationCommandSchema,
  databaseLifecycleCommandSchema,
} from "./lifecycle-commands";

test("creation requires a workspace and either a standalone database or parent page", () => {
  const command = {
    type: "database.create",
    workspaceId: "workspace",
    name: "Database",
    standalone: false,
  };
  assert.equal(databaseCreationCommandSchema.safeParse(command).success, false);
  assert.equal(
    databaseCreationCommandSchema.safeParse({ ...command, pageId: "page" }).success,
    true,
  );
  assert.equal(
    databaseCreationCommandSchema.safeParse({ ...command, standalone: true }).success,
    true,
  );
});

test("access commands cannot grant public edit or full agent access", () => {
  const command = {
    type: "access.upsert",
    targetType: "public",
    targetId: "*",
    accessLevel: "view",
  };
  assert.equal(databaseLifecycleCommandSchema.safeParse(command).success, true);
  assert.equal(
    databaseLifecycleCommandSchema.safeParse({ ...command, accessLevel: "edit" }).success,
    false,
  );
  assert.equal(
    databaseLifecycleCommandSchema.safeParse({
      ...command,
      targetType: "agent",
      accessLevel: "full",
    }).success,
    false,
  );
});
