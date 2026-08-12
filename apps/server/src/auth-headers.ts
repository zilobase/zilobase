type AuthContextProvider = {
  $context: Promise<{
    authCookies: { sessionToken: { name: string } };
  }>;
};

export const SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX =
  "zilobase.session.v1.";
export const COLLABORATION_WEBSOCKET_PROTOCOL =
  "zilobase.collaboration.v1";

export async function getAuthHeaders(
  auth: AuthContextProvider,
  headers: Headers,
) {
  const nextHeaders = new Headers(headers);

  if (nextHeaders.has("cookie")) {
    return nextHeaders;
  }

  const mobileAuthCookie = nextHeaders.get("x-mobile-auth-cookie")?.trim();

  if (mobileAuthCookie) {
    nextHeaders.set("cookie", mobileAuthCookie);
    return nextHeaders;
  }

  const websocketToken = readWebSocketSessionToken(nextHeaders);

  if (websocketToken && !nextHeaders.has("authorization")) {
    nextHeaders.set("authorization", `Bearer ${websocketToken}`);
  }

  const [scheme, token, extra] =
    nextHeaders.get("authorization")?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() === "bearer" && token && !extra) {
    const context = await auth.$context;
    nextHeaders.set(
      "cookie",
      `${context.authCookies.sessionToken.name}=${token}`,
    );
  }

  return nextHeaders;
}

export function readWebSocketSessionToken(headers: Headers) {
  const protocol = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .find((value) =>
      value.startsWith(SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX)
    );
  const encoded = protocol?.slice(
    SESSION_AUTH_WEBSOCKET_PROTOCOL_PREFIX.length,
  );

  if (!encoded || encoded.length > 16 * 1024) return null;

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const token = new TextDecoder().decode(bytes);
    return token.length > 0 && token.length <= 8 * 1024 ? token : null;
  } catch {
    return null;
  }
}
