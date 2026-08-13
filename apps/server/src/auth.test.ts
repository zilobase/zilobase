import { describe, expect, test } from "vitest";

import { getGoogleClientIds } from "./auth";

describe("Google OAuth client configuration", () => {
  test("keeps the web client first and accepts the desktop audience", () => {
    expect(
      getGoogleClientIds({
        GOOGLE_CLIENT_ID: "web-client",
        GOOGLE_DESKTOP_CLIENT_ID: "desktop-client",
      }),
    ).toEqual(["web-client", "desktop-client"]);
  });

  test("keeps hosted web authentication working without desktop configuration", () => {
    expect(getGoogleClientIds({ GOOGLE_CLIENT_ID: "web-client" })).toBe(
      "web-client",
    );
  });

  test("does not configure Google from a desktop client alone", () => {
    expect(
      getGoogleClientIds({ GOOGLE_DESKTOP_CLIENT_ID: "desktop-client" }),
    ).toBeUndefined();
  });
});
