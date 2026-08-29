import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
}));

vi.mock("../../access", () => ({
  getMembership: accessMocks.getMembership,
}));

import type { Database } from "../../infrastructure/database";
import { TeamspaceManagementService } from "./management";

type Row = Record<string, unknown>;

function createFakeDatabase() {
  const queues = {
    delete: [] as Row[][],
    insert: [] as Row[][],
    select: [] as Row[][],
    update: [] as Row[][],
  };
  const builder = (rows: Row[]) => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      limit: async () => rows,
      onConflictDoNothing: () => chain,
      onConflictDoUpdate: () => chain,
      orderBy: () => chain,
      returning: async () => rows,
      set: () => chain,
      then: <T>(resolve: (value: Row[]) => T) =>
        Promise.resolve(rows).then(resolve),
      values: () => chain,
      where: () => chain,
    };
    return chain;
  };
  const database = {
    delete: () => builder(queues.delete.shift() ?? []),
    insert: () => builder(queues.insert.shift() ?? []),
    select: () => builder(queues.select.shift() ?? []),
    transaction: async (run: (transaction: unknown) => unknown) =>
      run(database),
    update: () => builder(queues.update.shift() ?? []),
  };
  return { database: database as unknown as Database, queues };
}

const workspaceId = "workspace-1";
const userId = "user-1";
const baseTeamspace = {
  accessMode: "open",
  archivedAt: null,
  id: "teamspace-1",
  invitePolicy: "owners_and_members",
  isDefault: false,
  memberAccessLevel: "edit",
  name: "Engineering",
  sidebarEditPolicy: "owners_and_members",
  workspaceId,
};
const ownerPrincipal = {
  id: "principal-1",
  principalId: userId,
  principalType: "user",
  role: "owner",
  teamspaceId: baseTeamspace.id,
};

beforeEach(() => {
  accessMocks.getMembership.mockReset();
  accessMocks.getMembership.mockResolvedValue({ role: "owner" });
});

test("teamspace management covers settings, discovery, and membership flows", async () => {
  const { database, queues } = createFakeDatabase();
  const service = new TeamspaceManagementService(database);

  queues.select.push([{ creationPolicy: "workspace_members" }]);
  assert.deepEqual(await service.getWorkspaceSettings(workspaceId, userId), {
    canManage: true,
    creationPolicy: "workspace_members",
  });

  queues.update.push([{ creationPolicy: "workspace_owners" }]);
  assert.deepEqual(
    await service.updateWorkspaceSettings({
      creationPolicy: "workspace_owners",
      userId,
      workspaceId,
    }),
    { canManage: true, creationPolicy: "workspace_owners" },
  );

  queues.select.push([], [ownerPrincipal]);
  assert.equal(await service.getRole(baseTeamspace.id, userId), "owner");

  queues.select.push(
    [{ teamId: "team-1" }],
    [{ ...ownerPrincipal, principalId: "team-1", principalType: "team" }],
  );
  assert.equal(await service.getRole(baseTeamspace.id, userId), "owner");

  queues.select.push([baseTeamspace], [ownerPrincipal], []);
  const listed = await service.list({ userId, workspaceId });
  assert.equal(listed[0]?.currentUserRole, "owner");
  assert.equal(listed[0]?.memberCount, 1);

  queues.select.push([baseTeamspace], [], [ownerPrincipal]);
  assert.equal(
    (await service.get({ teamspaceId: baseTeamspace.id, userId, workspaceId }))
      .name,
    "Engineering",
  );

  queues.select.push([baseTeamspace]);
  queues.insert.push([{ ...ownerPrincipal, role: "member" }]);
  assert.equal(
    (
      await service.join({
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    )?.role,
    "member",
  );

  queues.select.push([baseTeamspace], [{ ...ownerPrincipal, role: "member" }]);
  queues.delete.push([]);
  assert.deepEqual(
    await service.leave({ teamspaceId: baseTeamspace.id, userId, workspaceId }),
    { removed: true },
  );
});

test("teamspace management covers create, update, and principal operations", async () => {
  const { database, queues } = createFakeDatabase();
  const service = new TeamspaceManagementService(database);

  queues.select.push([{ creationPolicy: "workspace_members" }]);
  queues.insert.push([baseTeamspace], [ownerPrincipal]);
  const created = await service.create({
    accessMode: "open",
    name: "Engineering",
    userId,
    workspaceId,
  });
  assert.equal(created.currentUserRole, "owner");

  queues.select.push([baseTeamspace], [], [ownerPrincipal]);
  queues.update.push([{ ...baseTeamspace, name: "Product Engineering" }]);
  assert.equal(
    (
      await service.update({
        name: "Product Engineering",
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).name,
    "Product Engineering",
  );

  queues.select.push(
    [baseTeamspace],
    [],
    [ownerPrincipal],
    [{ id: "member-2" }],
  );
  queues.insert.push([
    {
      id: "principal-2",
      principalId: "user-2",
      principalType: "user",
      role: "member",
      teamspaceId: baseTeamspace.id,
    },
  ]);
  assert.equal(
    (
      await service.addPrincipal({
        role: "member",
        targetUserId: "user-2",
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).principalId,
    "user-2",
  );

  queues.select.push(
    [baseTeamspace],
    [],
    [ownerPrincipal],
    [{ id: "team-2" }],
  );
  queues.insert.push([
    {
      id: "principal-team-2",
      principalId: "team-2",
      principalType: "team",
      role: "member",
      teamspaceId: baseTeamspace.id,
    },
  ]);
  assert.equal(
    (
      await service.addPrincipal({
        principalType: "team",
        role: "member",
        targetUserId: "team-2",
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).principalType,
    "team",
  );

  const memberPrincipal = {
    ...ownerPrincipal,
    id: "principal-2",
    principalId: "user-2",
    role: "member",
  };
  queues.select.push(
    [baseTeamspace],
    [],
    [ownerPrincipal],
    [memberPrincipal],
  );
  queues.update.push([{ ...memberPrincipal, role: "owner" }]);
  assert.equal(
    (
      await service.updatePrincipal({
        principalId: memberPrincipal.id,
        role: "owner",
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).role,
    "owner",
  );

  queues.select.push(
    [baseTeamspace],
    [],
    [ownerPrincipal],
    [memberPrincipal],
  );
  queues.delete.push([]);
  assert.deepEqual(
    await service.removePrincipal({
      principalId: memberPrincipal.id,
      teamspaceId: baseTeamspace.id,
      userId,
      workspaceId,
    }),
    { removed: true },
  );
});

test("teamspace management covers lifecycle, recovery, links, and defaults", async () => {
  const { database, queues } = createFakeDatabase();
  const service = new TeamspaceManagementService(database);

  queues.select.push([baseTeamspace], [], [ownerPrincipal]);
  queues.update.push([{ ...baseTeamspace, archivedAt: new Date() }]);
  assert.ok(
    (
      await service.archive({
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).archivedAt,
  );

  queues.select.push([{ ...baseTeamspace, archivedAt: new Date() }]);
  queues.update.push([baseTeamspace]);
  assert.equal(
    (
      await service.restore({
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).archivedAt,
    null,
  );

  queues.select.push([baseTeamspace], [{ count: 0 }]);
  queues.insert.push([ownerPrincipal]);
  assert.equal(
    (
      await service.recoverOwner({
        teamspaceId: baseTeamspace.id,
        userId,
        workspaceId,
      })
    ).role,
    "owner",
  );

  queues.select.push([baseTeamspace], [], [ownerPrincipal]);
  queues.update.push([]);
  const link = await service.updateInviteLink({
    enabled: true,
    teamspaceId: baseTeamspace.id,
    userId,
    workspaceId,
  });
  assert.equal(link.enabled, true);
  assert.ok(link.token);

  queues.select.push([baseTeamspace]);
  queues.insert.push([{ ...ownerPrincipal, role: "member" }]);
  assert.equal(
    (
      await service.acceptInvite({
        token: link.token!,
        userId,
        workspaceId,
      })
    ).teamspaceId,
    baseTeamspace.id,
  );

  queues.select.push(
    [{ id: baseTeamspace.id }],
    [{ userId }, { userId: "user-2" }],
  );
  queues.update.push([], []);
  queues.insert.push([], []);
  assert.deepEqual(
    await service.updateDefaults({
      defaultTeamspaceIds: [baseTeamspace.id],
      userId,
      workspaceId,
    }),
    { defaultTeamspaceIds: [baseTeamspace.id] },
  );
});
