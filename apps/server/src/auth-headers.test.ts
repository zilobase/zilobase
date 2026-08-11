import { describe, expect, test } from "vitest";

import { getAuthHeaders } from "./auth-headers";

const auth = {
  $context: Promise.resolve({
    authCookies: { sessionToken: { name: "__Secure-zilobase.session_token" } },
  }),
};

describe("getAuthHeaders", () => {
  test("passes bearer sessions to direct Better Auth API calls as cookies", async () => {
    const headers = await getAuthHeaders(
      auth,
      new Headers({ authorization: "Bearer signed.session" }),
    );

    expect(headers.get("cookie")).toBe(
      "__Secure-zilobase.session_token=signed.session",
    );
  });

  test("keeps explicit cookies ahead of bearer sessions", async () => {
    const headers = await getAuthHeaders(
      auth,
      new Headers({
        authorization: "Bearer signed.session",
        cookie: "existing=session",
      }),
    );

    expect(headers.get("cookie")).toBe("existing=session");
  });
});
