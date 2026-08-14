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
  "/desktop",
  "/images",
  "/metadata",
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
