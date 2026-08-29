import { describe, expect, test } from "vitest";

import { organizationRoles } from "./auth";
import { getTrustedOrigins } from "../../shared/config/config";

describe("browser authentication configuration", () => {
  test("trusts the canonical browser and exact desktop origins", () => {
    expect(
      getTrustedOrigins(
        { CLIENT_URL: "https://app.example.com" },
        "https://api.example.com",
      ),
    ).toEqual([
      "https://api.example.com",
      "https://app.example.com",
      "tauri://localhost",
      "http://tauri.localhost",
      "mobile://",
      "mobile://*",
    ]);
  });

  test("keeps built-in organization permissions when adding temporary access", () => {
    expect(Object.keys(organizationRoles)).toEqual([
      "admin",
      "owner",
      "member",
      "temporary",
    ]);
    expect(
      organizationRoles.owner.authorize({ invitation: ["create"] }).success,
    ).toBe(true);
    expect(
      organizationRoles.admin.authorize({ invitation: ["create"] }).success,
    ).toBe(true);
    expect(
      organizationRoles.temporary.authorize({ invitation: ["create"] }).success,
    ).toBe(false);
  });
});
