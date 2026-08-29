import { describe, expect, test } from "vitest";

import {
  getAuthHeaders,
  readWebSocketSessionToken,
  SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX,
} from "./auth-headers";

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

  test("accepts desktop sessions passed through a WebSocket subprotocol", async () => {
    const sessionToken = "signed.desktop.session";
    const encodedToken = Buffer.from(sessionToken).toString("base64url");
    const headers = new Headers({
      "sec-websocket-protocol": [
        "another.protocol",
        `${SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX}${encodedToken}`,
      ].join(", "),
    });

    expect(readWebSocketSessionToken(headers)).toBe(sessionToken);

    const authenticated = await getAuthHeaders(auth, headers);
    expect(authenticated.get("cookie")).toBe(
      "__Secure-zilobase.session_token=signed.desktop.session",
    );
  });

  test("ignores malformed WebSocket session protocols", async () => {
    const headers = new Headers({
      "sec-websocket-protocol":
        `${SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX}%%%`,
    });

    expect(readWebSocketSessionToken(headers)).toBeNull();
    expect((await getAuthHeaders(auth, headers)).has("cookie")).toBe(false);
  });
});
