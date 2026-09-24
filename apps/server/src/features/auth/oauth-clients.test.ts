import { describe, expect, test } from "vitest";

import { OFFICIAL_CLIPPER_CLIENT_ID, officialClipperRedirectUris } from "./oauth-clients";

describe("official clipper oauth client", () => {
  test("always includes the web callback and local loopback", () => {
    expect(OFFICIAL_CLIPPER_CLIENT_ID).toBe("zilobase-web-clipper");
    expect(officialClipperRedirectUris("https://app.example.com")).toEqual([
      "https://app.example.com/oauth/callback",
      "http://localhost:1420/oauth/callback",
    ]);
    expect(officialClipperRedirectUris("http://localhost:1420")).toEqual([
      "http://localhost:1420/oauth/callback",
    ]);
  });
});
