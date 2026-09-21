vi.mock("./instruction-pages", () => ({
  hydrateInstructionPage: async (_actor: unknown, definition: unknown) => definition,
  allInstructionResources: (definition: { resources: unknown[]; instructionResources?: unknown[] }) => [...definition.resources, ...(definition.instructionResources ?? [])],
}));
vi.mock("../../collaboration/service", () => ({ replacePageContent: vi.fn(), encodePageContentAsYjs: () => new Uint8Array() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { replacePageContent } from "../../collaboration/service";
import { emptySettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";

const memory = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  role: "owner",
  member: true,
  resourceAllowed: true,
  failMaterialization: false,
}));
vi.mock("../../access", () => ({
  getMembership: async () => memory.member,
  canAccessPageInWorkspace: async () => memory.resourceAllowed,
  canAccessDatabaseInWorkspace: async () => memory.resourceAllowed,
}));
vi.mock("../agents/agent-profile-service", () => {
  class AgentProfileError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  return {
    AgentProfileError,
    validateAccessPrincipals: async () => {},
    requireAgentProfileRole: async ({ minimum }: { minimum: string }) => {
      if (minimum === "editor" && memory.role === "user")
        throw new AgentProfileError("forbidden", "Read only", 403);
      return memory.role;
    },
  };
});
vi.mock("../agents/agent-resource-service", () => ({
  listAgentResources: async () => [],
}));
vi.mock("../agents/agent-revision-service", () => ({
  synchronizeMaterializedTriggers: async () => {
    if (memory.failMaterialization) throw new Error("trigger storage failed");
  },
}));
vi.mock("../../../infrastructure/database", async () => {
  const { getTableName, getTableColumns } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  type Row = Record<string, unknown>;
  const rows = (table: any) => (memory.tables[getTableName(table)] ??= []);
  const matches = (table: any, where: any, row: Row) => {
    if (!where) return true;
    const { sql, params } = dialect.sqlToQuery(where);
    const columns = Object.entries(getTableColumns(table));
    for (const m of sql.matchAll(/"[^\"]+"\."([^\"]+)" = \$(\d+)/g)) {
      const key = columns.find(([, c]: any) => c.name === m[1])?.[0];
      if (key && row[key] !== params[Number(m[2]) - 1]) return false;
    }
    return true;
  };
  const database: any = {
    select: () => ({
      from: (table: any) => {
        let where: any;
        const q: any = {
          where: (w: any) => {
            where = w;
            return q;
          },
          limit: () => q,
          for: () => q,
          orderBy: () => q,
          then: (resolve: any) =>
            resolve(
              structuredClone(
                rows(table).filter((r) => matches(table, where, r)),
              ),
            ),
        };
        return q;
      },
    }),
    insert: (table: any) => ({
      values: (input: Row | Row[]) => {
        let update: any;
        let skip = false;
        const q: any = {
          onConflictDoNothing: () => {
            skip = true;
            return q;
          },
          onConflictDoUpdate: (x: any) => {
            update = x.set;
            return q;
          },
          returning: () => q,
          then: (resolve: any) => {
            const result: Row[] = [];
            for (const value of Array.isArray(input) ? input : [input]) {
              const existing = rows(table).find(
                (r) =>
                  r.id === value.id ||
                  (value.settingsId &&
                    r.settingsId === value.settingsId &&
                    (value.userId
                      ? r.userId === value.userId
                      : r.version === value.version)),
              );
              if (existing && update) {
                Object.assign(existing, structuredClone(update));
                result.push(existing);
              } else if (!existing || !skip) {
                const next = {
                  createdAt: new Date(),
                  ...structuredClone(value),
                };
                rows(table).push(next);
                result.push(next);
              }
            }
            return resolve(result);
          },
        };
        return q;
      },
    }),
    update: (table: any) => ({
      set: (value: Row) => ({
        where: async (where: any) => {
          for (const row of rows(table))
            if (matches(table, where, row))
              Object.assign(row, structuredClone(value));
        },
      }),
    }),
    delete: (table: any) => ({
      where: async (where: any) => {
        memory.tables[getTableName(table)] = rows(table).filter(
          (r) => !matches(table, where, r),
        );
      },
    }),
    transaction: async (fn: any) => {
      const snapshot = structuredClone(memory.tables);
      try {
        return await fn(database);
      } catch (e) {
        memory.tables = snapshot;
        throw e;
      }
    },
  };
  return { db: database };
});
import {
  readSettings,
  createSettingsInstruction,
  updateSettingsDraft,
  publishSettings,
  discardSettingsDraft,
  sameSettings,
  mergeSettingsPatch,
} from "./settings-service";
const actor = { scope: "personal", workspaceId: "workspace", userId: "alice" };
function seed(scope = "personal:alice") {
  memory.tables.ai_settings = [
    {
      id: "settings",
      workspaceId: "workspace",
      scope,
      version: 1,
      definition: emptySettingsDefinition(),
    },
  ];
}
beforeEach(() => {
  memory.tables = {};
  memory.role = "owner";
  memory.member = true;
  memory.resourceAllowed = true;
  memory.failMaterialization = false;
  seed();
});
describe("canonical settings records", () => {
  it("creates an empty personal settings record and initial version once", async () => {
    memory.tables.ai_settings = [];
    const first = await readSettings(actor);
    expect(first.saved).toEqual(emptySettingsDefinition());
    expect(first.version).toBe(1);
    expect((await readSettings(actor)).saved).toEqual(first.saved);
    expect(memory.tables.ai_settings).toHaveLength(1);
    expect(memory.tables.ai_settings_version).toHaveLength(1);
  });
  it("rejects a custom agent without its canonical settings record", async () => {
    memory.tables.ai_settings = [];
    await expect(readSettings({ ...actor, scope: "missing" })).rejects.toMatchObject({ code: "agent_settings_missing" });
    expect(memory.tables.ai_settings).toHaveLength(0);
    expect(memory.tables.ai_settings_version).toBeUndefined();
  });
});
describe("private settings drafts", () => {
  it("persists AI provenance across reloads and manual configuration edits, then clears it on Save", async () => {
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { description: "Manual description" } });
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 1, patch: { name: "AI name" }, origin: "ai" });
    const reviewed = await readSettings(actor);
    expect(reviewed.review?.fields).toEqual(["name"]);
    expect(reviewed.review?.before.description).toBe("Manual description");
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 2, patch: { description: "More manual edits" } });
    expect((await readSettings(actor)).review?.fields).toEqual(["name"]);
    expect((await publishSettings(actor, { baseVersion: 1, draftVersion: 3 })).review).toBeNull();
  });
  it("restores the pre-AI instruction document on Discard", async () => {
    const pageId = "11111111-1111-4111-8111-111111111111";
    const baseline = { ...emptySettingsDefinition(), instructionPageId: pageId, instructions: "Original", instructionDocument: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] } };
    memory.tables.ai_settings[0]!.definition = baseline;
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { instructions: "AI revised" }, origin: "ai" });
    await discardSettingsDraft(actor, 1);
    expect(vi.mocked(replacePageContent)).toHaveBeenLastCalledWith(expect.objectContaining({ pageId, content: baseline.instructionDocument }));
    expect((await readSettings(actor)).review).toBeNull();
  });
  it("does not overwrite newer instruction edits when discarding AI changes", async () => {
    const baseline = { ...emptySettingsDefinition(), instructionPageId: "11111111-1111-4111-8111-111111111111" };
    memory.tables.ai_settings[0]!.definition = baseline;
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { instructions: "AI revised" }, origin: "ai" });
    await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 1, patch: { instructions: "New manual content" } });
    await expect(discardSettingsDraft(actor, 2)).rejects.toThrow("newer edits");
    expect((await readSettings(actor)).review).toBeTruthy();
  });
  it("creates one private linked page and rejects duplicate submissions without orphan pages", async () => {
    const input = { baseVersion: 1, draftVersion: 0 };
    const result = await createSettingsInstruction(actor, input);
    expect(result.definition.instructionPageId).toBeTruthy();
    expect(result.definition.instructionTitle).toBe("");
    expect(result.saved.instructionPageId).toBeUndefined();
    expect(memory.tables.page).toHaveLength(1);
    expect(memory.tables.page_collaboration_document).toHaveLength(1);
    await expect(createSettingsInstruction(actor, input)).rejects.toThrow();
    expect(memory.tables.page).toHaveLength(1);
    const next = await createSettingsInstruction(actor, { baseVersion: 1, draftVersion: 1 });
    expect(next.definition.instructionPageId).not.toBe(result.definition.instructionPageId);
    expect(memory.tables.page).toHaveLength(2);
    await discardSettingsDraft(actor, 2);
    expect((await readSettings(actor)).definition.instructionPageId).toBeUndefined();
    expect(memory.tables.page).toHaveLength(2);
  });
  it("rejects instruction creation for viewers before creating a page", async () => {
    seed("agent:agent");
    memory.role = "user";
    await expect(createSettingsInstruction({ ...actor, scope: "agent" }, { baseVersion: 1, draftVersion: 0 })).rejects.toThrow();
    expect(memory.tables.page).toBeUndefined();
  });
  it("stages changes without mutating the saved snapshot or creating a version", async () => {
    const state = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { instructions: "Be concise." },
    });
    expect(state.definition.instructions).toBe("Be concise.");
    expect(state.saved.instructions).toBe("");
    expect(memory.tables.ai_settings_version).toBeUndefined();
    expect(memory.tables.ai_agent_revision).toBeUndefined();
  });
  it("keeps each editor's draft private", async () => {
    seed("agent:agent");
    await updateSettingsDraft(
      { ...actor, scope: "agent" },
      { baseVersion: 1, draftVersion: 0, patch: { name: "Alice draft" } },
    );
    const bob = await readSettings({ ...actor, scope: "agent", userId: "bob" });
    expect(bob.definition.name).toBe("Personal Ask AI");
    expect(bob.draftVersion).toBe(0);
  });
  it("stages and versions instruction titles with their document", async () => {
    const draft = await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { instructionTitle: "Writing guide" } });
    expect(draft.definition.instructionTitle).toBe("Writing guide");
    expect(draft.saved.instructionTitle).toBe("Instructions");
    const saved = await publishSettings(actor, draft);
    expect(saved.saved.instructionTitle).toBe("Writing guide");
    expect(memory.tables.ai_settings_version).toHaveLength(1);
  });

  it("creates exactly one saved version and makes repeated Save harmless", async () => {
    const draft = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { instructions: "Use bullets." },
    });
    const saved = await publishSettings(actor, draft);
    expect(saved.version).toBe(2);
    expect(saved.saved.instructions).toBe("Use bullets.");
    await publishSettings(actor, draft);
    expect(memory.tables.ai_settings_version).toHaveLength(1);
  });
  it("does not create a version for an unchanged draft", async () => {
    const draft = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { description: "" },
    });
    expect((await publishSettings(actor, draft)).version).toBe(1);
    expect(memory.tables.ai_settings_version).toBeUndefined();
  });
  it("rejects an AI proposal based on an older draft", async () => {
    await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { description: "Manual edit" },
    });
    await expect(
      updateSettingsDraft(actor, {
        baseVersion: 1,
        draftVersion: 0,
        patch: { description: "Stale AI edit" },
      }),
    ).rejects.toMatchObject({ code: "settings_conflict" });
    expect((await readSettings(actor)).definition.description).toBe(
      "Manual edit",
    );
  });
  it("blocks stale publication after another editor saved", async () => {
    const draft = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { name: "Draft" },
    });
    memory.tables.ai_settings![0]!.version = 2;
    await expect(publishSettings(actor, draft)).rejects.toMatchObject({
      code: "settings_conflict",
    });
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
  });
  it("discard removes only this user's draft without creating a version", async () => {
    const draft = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { instructions: "Private" },
      pendingRun: "run after save",
    });
    expect(
      (await discardSettingsDraft(actor, draft.draftVersion)).pendingRun,
    ).toBeNull();
    expect(memory.tables.ai_settings_version).toBeUndefined();
  });
  it("read-only users cannot change drafts", async () => {
    seed("agent:agent");
    memory.role = "user";
    await expect(
      updateSettingsDraft(
        { ...actor, scope: "agent" },
        { baseVersion: 1, draftVersion: 0, patch: { name: "Blocked" } },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rolls back all publication writes when materialization fails", async () => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, {
      baseVersion: 1,
      draftVersion: 0,
      patch: { name: "New name" },
    });
    memory.failMaterialization = true;
    await expect(publishSettings(custom, draft)).rejects.toThrow(
      "trigger storage failed",
    );
    expect(memory.tables.ai_agent_profile![0]!.version).toBe(1);
    expect(memory.tables.ai_settings![0]!.version).toBe(1);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
    expect(memory.tables.ai_agent_revision).toBeUndefined();
  });
  it("rejects a connector belonging to another scope", async () => {
    const draft = await updateSettingsDraft(actor, {
      baseVersion: 1,
      draftVersion: 0,
      patch: {
        connectors: [
          { connectionId: "foreign", alwaysAllowEnabled: false, tools: [] },
        ],
      },
    });
    await expect(publishSettings(actor, draft)).rejects.toMatchObject({
      code: "connector_unavailable",
    });
  });
  it("rejects revoked resource grants before materializing a published agent", async () => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, { baseVersion: 1, draftVersion: 0, patch: { resources: [{ resourceType: "page", resourceId: "page", accessLevel: "edit" }] } });
    memory.resourceAllowed = false;
    await expect(publishSettings(custom, draft)).rejects.toMatchObject({ code: "agent_resource_grant_forbidden", status: 403 });
    expect(memory.tables.ai_settings![0]!.version).toBe(1);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
    expect(memory.tables.ai_agent_revision).toBeUndefined();
  });
  it("requires the connector authenticator to change always-allow policy", async () => {
    memory.tables.ai_mcp_connection = [{ id: "connection", workspaceId: "workspace", scopeType: "personal", scopeUserId: "alice", authenticatedByUserId: "bob", alwaysAllowEnabled: false }];
    const draft = await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { connectors: [{ connectionId: "connection", alwaysAllowEnabled: true, tools: [] }] } });
    await expect(publishSettings(actor, draft)).rejects.toMatchObject({ code: "connector_authenticator_required", status: 403 });
    expect(memory.tables.ai_mcp_connection[0]!.alwaysAllowEnabled).toBe(false);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
  });
  it("rejects an unsupported custom schedule before publication writes", async () => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, { baseVersion: 1, draftVersion: 0, patch: { triggers: [{ id: "trigger", kind: "schedule", label: "Too frequent", status: "active", config: { cadence: "custom", intervalMinutes: 1 } }] } });
    await expect(publishSettings(custom, draft)).rejects.toMatchObject({ code: "invalid_schedule" });
    expect(memory.tables.ai_settings![0]!.version).toBe(1);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
  });
  it.each([
    ["webhook", {}, "webhook_secret_required"],
    ["schedule", { cadence: "hourly" }, "invalid_schedule"],
    ["connector", {}, "trigger_adapter_required"],
    ["database", { event: "unsupported" }, "invalid_database_event"],
    ["meeting", { meetingId: "missing" }, "meeting_access_required"],
    ["database", { event: "row_added", databaseId: "ungranted" }, "trigger_access_required"],
  ] as const)("validates %s trigger authority and configuration before publication", async (kind, config, code) => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, { baseVersion: 1, draftVersion: 0, patch: { triggers: [{ id: "trigger", kind, config, label: "Trigger", status: "active" }] } });
    await expect(publishSettings(custom, draft)).rejects.toMatchObject({ code });
    expect(memory.tables.ai_settings![0]!.version).toBe(1);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
  });
  it("rejects an unavailable connector tool without replacing saved policy", async () => {
    memory.tables.ai_mcp_connection = [{ id: "connection", workspaceId: "workspace", scopeType: "personal", scopeUserId: "alice", authenticatedByUserId: "alice", alwaysAllowEnabled: false }];
    memory.tables.ai_mcp_tool_snapshot = [{ id: "tool", connectionId: "connection", available: false, enabled: false }];
    const draft = await updateSettingsDraft(actor, { baseVersion: 1, draftVersion: 0, patch: { connectors: [{ connectionId: "connection", alwaysAllowEnabled: false, tools: [{ toolId: "tool", enabled: true, classification: "read", executionMode: "always_ask" }] }] } });
    await expect(publishSettings(actor, draft)).rejects.toMatchObject({ code: "connector_tool_unavailable" });
    expect(memory.tables.ai_mcp_tool_snapshot[0]!.enabled).toBe(false);
    expect(memory.tables.ai_settings_draft).toHaveLength(1);
  });
  it("publishes profile, resources, sharing and connector policy in one version", async () => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    memory.tables.ai_mcp_connection = [
      {
        id: "connection",
        scopeType: "agent",
        agentProfileId: "agent",
        workspaceId: "workspace",
        authenticatedByUserId: "alice",
        alwaysAllowEnabled: false,
      },
    ];
    memory.tables.ai_mcp_tool_snapshot = [
      {
        id: "tool",
        connectionId: "connection",
        enabled: false,
        available: true,
      },
    ];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, {
      baseVersion: 1,
      draftVersion: 0,
      patch: {
        name: "Saved agent",
        resources: [
          { resourceType: "page", resourceId: "page", accessLevel: "view" },
        ],
        grants: [{ principalType: "user", principalId: "bob", role: "user" }],
        connectors: [
          {
            connectionId: "connection",
            alwaysAllowEnabled: false,
            tools: [
              {
                toolId: "tool",
                enabled: true,
                executionMode: "always_ask",
                classification: "read",
              },
            ],
          },
        ],
      },
    });
    expect(memory.tables.page_access).toBeUndefined();
    await publishSettings(custom, draft);
    expect(memory.tables.page_access).toHaveLength(1);
    expect(memory.tables.ai_agent_profile_access).toHaveLength(1);
    expect(memory.tables.ai_mcp_tool_snapshot![0]!.enabled).toBe(true);
    expect(memory.tables.ai_agent_revision).toHaveLength(1);
    expect(memory.tables.ai_settings_version).toHaveLength(1);
  });
  it("publishes derived instruction access and removes it when the link changes", async () => {
    seed("agent:agent");
    memory.tables.ai_agent_profile = [{ id: "agent", version: 1 }];
    const custom = { ...actor, scope: "agent" };
    const draft = await updateSettingsDraft(custom, { baseVersion: 1, draftVersion: 0, patch: {
      instructionResources: [{ resourceType: "database", resourceId: "linked-database", accessLevel: "view" }],
    } });
    expect(memory.tables.database_access).toBeUndefined();
    const saved = await publishSettings(custom, draft);
    expect(memory.tables.database_access).toEqual([expect.objectContaining({ databaseId: "linked-database", targetId: "agent", accessLevel: "view" })]);
    const changed = await updateSettingsDraft(custom, { baseVersion: saved.version, draftVersion: 0, patch: { instructionResources: [] } });
    await publishSettings(custom, changed);
    expect(memory.tables.database_access).toHaveLength(0);
  });
  it("cannot publish custom triggers in personal settings", async () => {
    await expect(
      updateSettingsDraft(actor, {
        baseVersion: 1,
        draftVersion: 0,
        patch: {
          triggers: [
            {
              id: "trigger",
              kind: "schedule",
              config: { cadence: "daily" },
              label: "Daily",
              status: "active",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_personal_settings" });
  });
  it("denies reads outside active workspace membership", async () => {
    memory.member = false;
    await expect(readSettings(actor)).rejects.toMatchObject({ status: 403 });
  });
  it("preserves manual fields while changing instructions and builds the rich document", () => {
    const initial = { ...emptySettingsDefinition(), name: "Manual name" };
    const next = mergeSettingsPatch(initial, {
      instructions: "# Guidelines\n\nKeep answers short.",
    });
    expect(next.name).toBe("Manual name");
    expect(next.instructionDocument.type).toBe("doc");
  });
  it("compares persisted JSON independent of object key ordering", () => {
    expect(
      sameSettings({ b: 2, a: { c: 3, d: 4 } }, { a: { d: 4, c: 3 }, b: 2 }),
    ).toBe(true);
    expect(sameSettings([1, 2], [2, 1])).toBe(false);
  });
});
