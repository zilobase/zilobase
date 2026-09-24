import assert from "node:assert/strict";
import test from "node:test";

import { resolveActiveWorkspaceId } from "./hooks";

test("active workspace waits for the workspace list before trusting stored IDs", () => {
  assert.equal(
    resolveActiveWorkspaceId({
      preferredActiveWorkspaceId: "stale-workspace",
      sessionWorkspaceId: "stale-session-workspace",
      status: "pending",
      workspaces: [],
    }),
    null,
  );
});

test("active workspace selects only IDs present in the loaded workspace list", () => {
  const workspaces = [{ id: "first-workspace" }, { id: "session-workspace" }];

  assert.equal(
    resolveActiveWorkspaceId({
      preferredActiveWorkspaceId: "stale-workspace",
      sessionWorkspaceId: "session-workspace",
      status: "success",
      workspaces,
    }),
    "session-workspace",
  );
  assert.equal(
    resolveActiveWorkspaceId({
      preferredActiveWorkspaceId: "stale-workspace",
      sessionWorkspaceId: "stale-session-workspace",
      status: "success",
      workspaces,
    }),
    "first-workspace",
  );
});

test("active workspace uses the unvalidated fallback only when listing fails", () => {
  assert.equal(
    resolveActiveWorkspaceId({
      preferredActiveWorkspaceId: "stored-workspace",
      sessionWorkspaceId: "session-workspace",
      status: "error",
      workspaces: [],
    }),
    "session-workspace",
  );
});
