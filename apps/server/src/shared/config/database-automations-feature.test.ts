import { describe, expect, it } from "vitest";

import { isDatabaseAutomationsFeatureEnabled } from "./config";

describe("database automation workspace release capability", () => {
  it("defaults off and supports a server-owned workspace allowlist", () => {
    expect(isDatabaseAutomationsFeatureEnabled({}, "workspace-1")).toBe(false);
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED_WORKSPACE_IDS: "workspace-2, workspace-1",
    }, "workspace-1")).toBe(true);
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED_WORKSPACE_IDS: "workspace-2",
    }, "workspace-1")).toBe(false);
  });

  it("supports an explicit global release switch", () => {
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED: "true",
    }, "workspace-1")).toBe(true);
  });
});
