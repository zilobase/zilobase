type AuthContextProvider = {
  $context: Promise<{
    authCookies: { sessionToken: { name: string } };
  }>;
};

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
