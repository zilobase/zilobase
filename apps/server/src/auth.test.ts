import { describe, expect, test } from "vitest";

import { getTrustedOrigins } from "./config";

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
});
