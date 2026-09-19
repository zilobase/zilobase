const apiPathPrefixes = [
  "/.well-known",
  "/api",
  "/clips",
  "/agents",
  "/automation-slack",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/workspaces",
  "/search",
  "/pages",
  "/page-guest-invitations",
  "/page-layouts",
  "/databases",
  "/demo",
  "/desktop",
  "/images",
  "/mail",
  "/calendar/oauth",
  "/calendar/google",
  "/metadata",
  "/meetings",
  "/user-settings",
  "/comments",
  "/health",
  "/ready",
];

export function isNodeApiPath(pathname: string) {
  return apiPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
