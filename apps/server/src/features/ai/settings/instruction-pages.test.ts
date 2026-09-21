import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";
const state = vi.hoisted(() => ({
  records: [] as unknown[][],
  denied: new Set<string>(),
}));
vi.mock("../../../infrastructure/database", () => {
  const db: any = {
    select: () => ({ from: () => ({ where: () => {
      const result = Promise.resolve(state.records.shift() ?? []);
      return Object.assign(result, { for: () => result });
    } }) }),
  };
  return { db };
});
vi.mock("../../access", () => ({
  canAccessPageInWorkspace: async (id: string) => !state.denied.has(id),
  canAccessDatabaseInWorkspace: async (id: string) => !state.denied.has(id),
}));
vi.mock("../agents/agent-profile-service", () => ({
  AgentProfileError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
import {
  allInstructionResources,
  hydrateInstructionPage,
  instructionReferences,
} from "./instruction-pages";
const root = "11111111-1111-4111-8111-111111111111";
const linked = "22222222-2222-4222-8222-222222222222";
const database = "33333333-3333-4333-8333-333333333333";
const actor = { scope: "agent", workspaceId: "workspace", userId: "owner" };
beforeEach(() => {
  state.records = [];
  state.denied.clear();
});
describe("linked instruction pages", () => {
  it("extracts native links, embedded pages and databases without duplicate grants", () => {
    expect(
      instructionReferences({
        content: [
          { type: "database", attrs: { databaseId: database } },
          { type: "page", attrs: { pageId: linked } },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: `/p/${linked}` } }],
          },
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: { href: `https://example.com/p/${root}` },
              },
            ],
          },
        ],
      }),
    ).toHaveLength(2);
  });
  it("follows accessible nested instruction links and stops cycles", async () => {
    state.records = [
      [
        {
          id: root,
          name: "Guide",
          content: {
            type: "doc",
            content: [{ type: "page", attrs: { pageId: linked } }],
          },
        },
      ],
      [
        {
          id: linked,
          content: {
            content: [{ attrs: { pageId: root, databaseId: database } }],
          },
        },
      ],
    ];
    const d = await hydrateInstructionPage(actor, {
      ...emptySettingsDefinition(),
      instructionPageId: root,
    });
    expect(d.instructionTitle).toBe("Guide");
    expect(d.instructionResources?.map((r) => r.resourceId)).toEqual([
      root,
      linked,
      database,
    ]);
    expect(d.instructionResources?.every((r) => r.accessLevel === "view")).toBe(
      true,
    );
  });
  it("never grants linked resources the configuring user cannot access", async () => {
    state.denied.add(database);
    state.records = [
      [
        {
          id: root,
          name: "",
          content: { content: [{ attrs: { databaseId: database } }] },
        },
      ],
    ];
    const d = await hydrateInstructionPage(actor, {
      ...emptySettingsDefinition(),
      instructionPageId: root,
    });
    expect(d.instructionResources?.map((r) => r.resourceId)).toEqual([root]);
  });
  it("rejects an inaccessible root instruction page", async () => {
    state.denied.add(root);
    await expect(
      hydrateInstructionPage(actor, {
        ...emptySettingsDefinition(),
        instructionPageId: root,
      }),
    ).rejects.toThrow("cannot access");
  });
  it("retains explicit permission levels when an instruction also links the resource", () => {
    const d = {
      ...emptySettingsDefinition(),
      resources: [
        {
          resourceType: "page" as const,
          resourceId: root,
          accessLevel: "edit" as const,
        },
      ],
      instructionResources: [
        {
          resourceType: "page" as const,
          resourceId: root,
          accessLevel: "view" as const,
        },
      ],
    };
    expect(allInstructionResources(d)).toEqual(d.resources);
  });
});
