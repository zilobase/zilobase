import { describe, expect, it } from "vitest";
import { emptySettingsDefinition, hasAgentConfigurationChanges, mergeSettingsReview, changedSettingsFields, settingsFieldTab } from "@zilobase/features/ai-chat/settings-contract";

const saved = { ...emptySettingsDefinition(), instructionPageId: "11111111-1111-4111-8111-111111111111" };
describe("agent configuration dirty state", () => {
  it("ignores live edits to the same linked instruction page", () => {
    expect(hasAgentConfigurationChanges({
      ...saved,
      instructionTitle: "Changed title",
      instructions: "New page content",
      instructionDocument: { type: "doc", content: [{ type: "paragraph" }] },
      instructionResources: [{ resourceType: "database", resourceId: "database", accessLevel: "view" }],
    }, saved)).toBe(false);
  });
  it("ignores field ordering introduced by migrating the saved page link", () => {
    const { instructionPageId, ...rest } = saved;
    expect(hasAgentConfigurationChanges({ instructionPageId, ...rest }, saved)).toBe(false);
  });
  it("still detects switching or creating an instruction page", () => {
    expect(hasAgentConfigurationChanges({ ...saved, instructionPageId: "22222222-2222-4222-8222-222222222222" }, saved)).toBe(true);
    expect(hasAgentConfigurationChanges(saved, emptySettingsDefinition())).toBe(true);
  });
  it("keeps real settings changes dirty alongside page edits", () => {
    expect(hasAgentConfigurationChanges({ ...saved, instructions: "Autosaved", connectors: [{ connectionId: "gmail", alwaysAllowEnabled: false, tools: [] }] }, saved)).toBe(true);
    expect(hasAgentConfigurationChanges({ ...saved, name: "Renamed agent" }, saved)).toBe(true);
  });
  it("treats unlinked instruction text as a configuration change", () => {
    const saved = emptySettingsDefinition();
    expect(hasAgentConfigurationChanges({ ...saved, instructions: "Proposed instructions" }, saved)).toBe(true);
  });
});

describe("AI settings review", () => {
  it("retains the pre-AI baseline across proposals and clears reverted changes", () => {
    const first = mergeSettingsReview(null, saved, { ...saved, instructions: "First" }, ["instructions"]);
    const next = mergeSettingsReview(first, { ...saved, instructions: "First", description: "Manual" }, { ...saved, instructions: "Second", description: "Manual" }, ["instructions"]);
    expect(next?.before.instructions).toBe(saved.instructions);
    expect(next?.after.instructions).toBe("Second");
    expect(next?.fields).toEqual(["instructions"]);
    expect(mergeSettingsReview(next, next!.after, { ...next!.after, instructions: saved.instructions }, ["instructions"])).toBeNull();
  });
  it("distinguishes AI instruction edits from ordinary page autosave and marks affected tabs", () => {
    const definition = { ...saved, instructions: "AI edit", connectors: [{ connectionId: "github", alwaysAllowEnabled: true, tools: [] }] };
    const state = { definition, saved, baseVersion: 1, version: 1, draftVersion: 1, canEdit: true, pendingRun: null };
    expect(changedSettingsFields(state)).toEqual(["connectors"]);
    const review = mergeSettingsReview(null, saved, definition, ["instructions", "connectors"]);
    expect(changedSettingsFields({ ...state, review }).map(settingsFieldTab).sort()).toEqual(["connectors", "instructions"]);
    expect(settingsFieldTab("triggers")).toBe("access");
    expect(settingsFieldTab("resources")).toBe("access");
  });
});
