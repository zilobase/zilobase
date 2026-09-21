import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveAgentProfile,
  createAgentProfile,
  duplicateAgentProfile,
  getAgentProfileDetail,
  getAgentProfileRole,
  listAccessibleAgentProfiles,
  requireAgentProfileRole,
  transferAgentProfileOwnership,
} from "./agent-profile-service";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
  active: true,
}));
vi.mock("../../../infrastructure/database", async () => {
  const { getTableName } = await import("drizzle-orm");
  function query(table: Parameters<typeof getTableName>[0]) {
    const q = {
      where: () => q,
      limit: () => q,
      for: () => q,
      orderBy: () => q,
      then: (resolve: (value: unknown) => unknown) =>
        resolve(
          getTableName(table) === "member"
            ? state.active
              ? [{ id: "membership" }]
              : []
            : (state.rows.shift() ?? []),
        ),
    };
    return q;
  }
  const db = {
    select: () => ({ from: query }),
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        state.writes.push(value);
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.writes.push(value);
        return { where: async () => undefined };
      },
    }),
    delete: () => ({ where: async () => undefined }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
      callback(db),
  };
  return { db };
});

const input = { profileId: "agent", userId: "owner", workspaceId: "workspace" };
const profile = {
  id: "agent",
  ownerUserId: "owner",
  name: "Agent",
  instructions: "Saved",
  defaultModel: "auto",
  description: "Description",
  version: 1,
  currentRevisionId: "revision",
  status: "active",
  updatedAt: new Date(),
  iconPosition: "inline",
};
beforeEach(() => {
  state.rows = [];
  state.writes = [];
  state.active = true;
});

describe("standalone agent ownership and revisions", () => {
  it("does not retain agent ownership after workspace removal", async () => {
    state.active = false;
    state.rows = [[profile]];
    expect(await getAgentProfileRole(input)).toBeNull();
    expect(await listAccessibleAgentProfiles(input)).toEqual([]);
    await expect(
      createAgentProfile({
        name: "New",
        ownerUserId: "owner",
        workspaceId: "workspace",
      }),
    ).rejects.toThrow("membership");
    expect(state.writes).toEqual([]);
  });
  it("returns owner without merging sharing roles", async () => {
    state.rows = [[profile]];
    expect(await getAgentProfileRole(input)).toBe("owner");
  });
  it("chooses the strongest explicit user/team role", async () => {
    state.rows = [
      [profile],
      [{ role: "user" }, { role: "editor" }, { role: "user" }],
    ];
    expect(await getAgentProfileRole({ ...input, userId: "shared" })).toBe(
      "editor",
    );
    state.rows = [[profile], []];
    expect(
      await getAgentProfileRole({ ...input, userId: "outsider" }),
    ).toBeNull();
  });
  it("denies missing agents and insufficient roles", async () => {
    await expect(
      requireAgentProfileRole({ ...input, minimum: "user" }),
    ).rejects.toThrow("not found");
    state.rows = [[profile], [{ role: "user" }]];
    await expect(
      requireAgentProfileRole({
        ...input,
        userId: "shared",
        minimum: "editor",
      }),
    ).rejects.toThrow("permission");
  });
  it("keeps new agents private with a first immutable revision and shared builder conversation", async () => {
    const result = await createAgentProfile({
      name: "New",
      ownerUserId: "owner",
      workspaceId: "workspace",
    });
    expect(result).toBeNull(); // Readback has no fixture; verify the complete creation transaction.
    expect(state.writes).toHaveLength(6);
    expect(state.writes.some((value) => "pageId" in value || "metadata" in value)).toBe(false);
    expect(state.writes[0]).toMatchObject({
      name: "New",
      status: "active",
      version: 1,
      instructions: "",
    });
    expect(state.writes[1]).toMatchObject({
      version: 1,
      definition: { triggers: [], safeExecutionPreferences: {} },
    });
    expect(state.writes[3]).toMatchObject({ scope: expect.stringMatching(/^agent:/) });
    expect(state.writes[5]).toMatchObject({ profileId: expect.any(String) });
    expect(
      state.writes.some(
        (value) => "authenticatedByUserId" in value || "principalId" in value,
      ),
    ).toBe(false);
  });
  it("returns an authorized detail without changing connection ownership", async () => {
    state.rows = [
      [profile],
      [profile],
      [
        {
          id: "grant",
          principalId: "team",
          principalType: "team",
          role: "user",
        },
      ],
      [
        {
          id: "connection",
          agentProfileId: "agent",
          authenticatedByUserId: "owner",
        },
      ],
    ];
    expect(await getAgentProfileDetail(input)).toMatchObject({
      role: "owner",
      instructions: "Saved",
      access: [{ principalId: "team" }],
      connections: [{ scope: { type: "agent", agentProfileId: "agent" } }],
    });
  });
  it("lists visits without exposing inaccessible profiles", async () => {
    state.rows = [
      [profile],
      [{ itemId: "agent", lastVisitedAt: new Date("2026-01-01") }],
      [profile],
    ];
    expect((await listAccessibleAgentProfiles(input))[0]).toMatchObject({
      id: "agent",
      role: "owner",
      lastVisitedAt: "2026-01-01T00:00:00.000Z",
    });
  });
  it("requires reconnect after ownership transfer", async () => {
    state.rows = [[profile]];
    await transferAgentProfileOwnership({
      ...input,
      newOwnerUserId: "new-owner",
    });
    expect(state.writes[0]).toMatchObject({ ownerUserId: "new-owner" });
    expect(state.writes[1]).toMatchObject({
      state: "reconnect_required",
      lastErrorCode: "ownership_changed",
    });
  });
  it("archives an agent and disables its connectors", async () => {
    state.rows = [[profile]];
    expect(await archiveAgentProfile(input)).toEqual({
      archived: true,
    });
    expect(state.writes[0]).toMatchObject({ status: "archived" });
    expect(state.writes[1]).toMatchObject({ state: "disabled" });
  });
  it("duplicates configuration but not credentials or sharing", async () => {
    state.rows = [[profile], [profile]];
    await duplicateAgentProfile(input);
    expect(state.writes[2]).toMatchObject({
      name: "Agent copy",
      instructions: "Saved",
      ownerUserId: "owner",
    });
    expect(state.writes).toHaveLength(8);
  });
});
