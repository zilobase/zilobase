const apiPathPrefixes = [
  "/.well-known",
  "/api",
  "/agents",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/workspaces",
  "/search",
  "/pages",
  "/databases",
  "/demo",
  "/desktop",
  "/images",
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
