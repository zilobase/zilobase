import { describe, expect, it } from "vitest";

import { isDatabaseAutomationsFeatureEnabled } from "./config";

describe("database automation release capability", () => {
  it("follows the global switch", () => {
    expect(isDatabaseAutomationsFeatureEnabled({})).toBe(false);
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED: "false",
    })).toBe(false);
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED: "true",
    })).toBe(true);
    expect(isDatabaseAutomationsFeatureEnabled({
      DATABASE_AUTOMATIONS_ENABLED: "TRUE",
    })).toBe(true);
  });
});
