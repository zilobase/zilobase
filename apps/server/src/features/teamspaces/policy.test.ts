import assert from "node:assert/strict";
import { test } from "vitest";

import {
  canCreateTeamspace,
  canDiscoverTeamspace,
  canInviteTeamspaceMembers,
  canJoinTeamspace,
  canManageTeamspace,
  resolveTeamspaceBaselineAccess,
} from "./policy";

test("teamspace creation follows workspace policy", () => {
  assert.equal(
    canCreateTeamspace({
      creationPolicy: "workspace_owners",
      isActiveWorkspaceMember: true,
      workspaceRole: "owner",
    }),
    true,
  );
  assert.equal(
    canCreateTeamspace({
      creationPolicy: "workspace_owners",
      isActiveWorkspaceMember: true,
      workspaceRole: "member",
    }),
    false,
  );
  assert.equal(
    canCreateTeamspace({
      creationPolicy: "workspace_members",
      isActiveWorkspaceMember: false,
      workspaceRole: "member",
    }),
    false,
  );
});

test("private teamspaces are undiscoverable to ordinary non-members", () => {
  assert.equal(
    canDiscoverTeamspace({
      accessMode: "private",
      isTeamspacePrincipal: false,
      isWorkspaceOwner: false,
    }),
    false,
  );
  assert.equal(
    canDiscoverTeamspace({
      accessMode: "private",
      isTeamspacePrincipal: true,
      isWorkspaceOwner: false,
    }),
    true,
  );
  assert.equal(
    canDiscoverTeamspace({
      accessMode: "closed",
      isTeamspacePrincipal: false,
      isWorkspaceOwner: false,
    }),
    true,
  );
});

test("only active workspace members can self-join open teamspaces", () => {
  assert.equal(
    canJoinTeamspace({
      accessMode: "open",
      archived: false,
      isActiveWorkspaceMember: true,
    }),
    true,
  );
  assert.equal(
    canJoinTeamspace({
      accessMode: "closed",
      archived: false,
      isActiveWorkspaceMember: true,
    }),
    false,
  );
  assert.equal(
    canJoinTeamspace({
      accessMode: "open",
      archived: true,
      isActiveWorkspaceMember: true,
    }),
    false,
  );
});

test("teamspace roles determine management, invitations, and baseline access", () => {
  assert.equal(
    canManageTeamspace({ isWorkspaceOwner: false, teamspaceRole: "owner" }),
    true,
  );
  assert.equal(
    canManageTeamspace({ isWorkspaceOwner: false, teamspaceRole: "member" }),
    false,
  );
  assert.equal(
    canInviteTeamspaceMembers({
      invitePolicy: "owners",
      teamspaceRole: "member",
    }),
    false,
  );
  assert.equal(
    canInviteTeamspaceMembers({
      invitePolicy: "owners_and_members",
      teamspaceRole: "member",
    }),
    true,
  );
  assert.equal(
    resolveTeamspaceBaselineAccess({
      memberAccessLevel: "edit",
      teamspaceRole: "owner",
    }),
    "full",
  );
  assert.equal(
    resolveTeamspaceBaselineAccess({
      accessLevelOverride: "comment",
      memberAccessLevel: "edit",
      teamspaceRole: "member",
    }),
    "comment",
  );
  assert.equal(
    resolveTeamspaceBaselineAccess({
      memberAccessLevel: "edit",
      teamspaceRole: null,
    }),
    "none",
  );
});
