import { beforeEach, expect, it, vi } from "vitest";
import { emptySettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  Output: { object: (x: unknown) => x },
  tool: (x: unknown) => x,
}));
vi.mock("../providers/ai-provider", () => ({
  resolveWorkspaceAiModel: async () => ({ model: {} }),
}));
vi.mock("./settings-context", () => ({
  settingsEditContext: async () => ({}),
}));
vi.mock("./settings-service", () => ({
  readSettings: mocks.read,
  updateSettingsDraft: mocks.update,
}));
import { buildSettingsTools, proposeSettings } from "./settings-tools";
const actor = { scope: "agent", userId: "alice", workspaceId: "workspace" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    definition: emptySettingsDefinition(),
    baseVersion: 3,
    draftVersion: 7,
  });
});
it.each([
  ["instructions", { instructions: "Use short answers." }],
  [
    "connectors",
    {
      connectors: [{ connectionId: "github", alwaysAllowEnabled: false, tools: [] }],
    },
  ],
  [
    "triggers",
    {
      triggers: [
        {
          id: "schedule",
          kind: "schedule",
          label: "Daily",
          config: { cadence: "daily" },
          status: "active",
        },
      ],
    },
  ],
  [
    "access",
    {
      resources: [{ resourceType: "page", resourceId: "page", accessLevel: "view" }],
    },
  ],
])("validates and stages a %s proposal using the current draft revision", async (tab, patch) => {
  mocks.generate.mockResolvedValue({
    output: { tab, summary: "Prepared", patchJson: JSON.stringify(patch) },
  });
  await proposeSettings(actor, "Make this change");
  expect(mocks.update).toHaveBeenCalledWith(
    actor,
    {
      patch,
      origin: "ai",
      baseVersion: 3,
      draftVersion: 7,
    },
    undefined,
  );
});
it("rejects malformed model output without updating a draft", async () => {
  mocks.generate.mockResolvedValue({
    output: {
      tab: "instructions",
      summary: "Prepared",
      patchJson: '{"instructions":42}',
    },
  });
  await expect(proposeSettings(actor, "Change instructions")).rejects.toThrow();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("binds personal draft operations to the streaming database scope", async () => {
  const events: unknown[] = [];
  const withDb = vi.fn(async (fn: () => Promise<unknown>) => fn());
  const tools = buildSettingsTools(actor, (e) => events.push(e), withDb as never) as any;
  tools.proposeAgentSettings.onInputStart();
  expect(events).toEqual([{ scope: "agent", tab: "instructions", status: "editing" }]);
  await tools.readAgentSettings.execute();
  await tools.proposeAgentSettings.execute({
    patchJson: '{"instructions":"Be concise"}',
    tab: "instructions",
    summary: "Prepared",
    baseVersion: 3,
    draftVersion: 7,
  });
  expect(withDb).toHaveBeenCalledTimes(2);
  expect(events.at(-1)).toMatchObject({ status: "ready" });
});

it.each(["defaultModel", "responseStyle"])("rejects the removed %s setting", async (field) => {
  mocks.generate.mockResolvedValue({
    output: {
      tab: "instructions",
      summary: "Prepared",
      patchJson: JSON.stringify({ [field]: "auto" }),
    },
  });
  await expect(proposeSettings(actor, "Change a removed setting")).rejects.toThrow();
  expect(mocks.update).not.toHaveBeenCalled();
});
