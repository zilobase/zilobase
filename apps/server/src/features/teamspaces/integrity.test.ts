import assert from "node:assert/strict";
import { test } from "vitest";

import {
  findTeamspaceIntegrityIssues,
  type TeamspaceIntegritySnapshot,
} from "./integrity";

test("teamspace integrity checker reports unsafe domain drift", () => {
  const snapshot: TeamspaceIntegritySnapshot = {
    members: [{ userId: "user-1", workspaceId: "workspace-1" }],
    pages: [
      { id: "parent", teamspaceId: "teamspace-1", workspaceId: "workspace-1" },
      { id: "child", teamspaceId: null, workspaceId: "workspace-1" },
    ],
    placements: [
      {
        deleted: false,
        itemId: "child",
        itemKind: "page",
        parentId: "parent",
        parentKind: "page",
        placementKind: "primary",
      },
    ],
    principals: [
      {
        id: "principal-1",
        principalId: "missing-user",
        principalType: "user",
        role: "member",
        teamspaceId: "teamspace-1",
      },
    ],
    teams: [],
    teamspaces: [
      {
        archived: true,
        id: "teamspace-1",
        inviteLinkEnabled: true,
        inviteLinkTokenHash: null,
        isDefault: true,
        workspaceId: "workspace-1",
      },
    ],
    workspaces: [{ id: "workspace-1" }],
  };

  assert.deepEqual(
    findTeamspaceIntegrityIssues(snapshot).map((issue) => issue.code).sort(),
    [
      "archived_default",
      "invalid_principal",
      "invite_link_missing_token",
      "missing_default",
      "page_scope_drift",
    ],
  );
});

test("teamspace integrity checker accepts a healthy default", () => {
  const snapshot: TeamspaceIntegritySnapshot = {
    members: [{ userId: "user-1", workspaceId: "workspace-1" }],
    pages: [],
    placements: [],
    principals: [
      {
        id: "principal-1",
        principalId: "user-1",
        principalType: "user",
        role: "owner",
        teamspaceId: "teamspace-1",
      },
    ],
    teams: [],
    teamspaces: [
      {
        archived: false,
        id: "teamspace-1",
        inviteLinkEnabled: false,
        inviteLinkTokenHash: null,
        isDefault: true,
        workspaceId: "workspace-1",
      },
    ],
    workspaces: [{ id: "workspace-1" }],
  };

  assert.deepEqual(findTeamspaceIntegrityIssues(snapshot), []);
});
