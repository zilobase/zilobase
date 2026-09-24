type ReturnScope = { type: "personal" } | { type: "agent"; agentProfileId: string };

/** Only local conversation/settings routes can be OAuth return destinations. */
export function safeAgentReturnPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return null;
  const url = new URL(value, "https://local.invalid");
  if (
    url.origin !== "https://local.invalid" ||
    !(url.pathname === "/ai" || /^\/agents\/[^/]+$/.test(url.pathname))
  )
    return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
export function mcpOAuthReturnUrl(
  origin: string,
  scope: ReturnScope | null,
  outcome: "connected" | "failed",
  returnTo?: string | null,
) {
  const agentId = scope?.type === "agent" ? scope.agentProfileId : null;
  const safe = safeAgentReturnPath(returnTo);
  const target = new URL(
    safe ?? (agentId ? `/agents/${encodeURIComponent(agentId)}` : "/ai"),
    origin,
  );
  if (!safe) {
    target.searchParams.set("panel", "settings");
    target.searchParams.set("settingsTab", "connectors");
    if (!agentId) target.searchParams.set("settingsScope", "personal");
  }
  target.searchParams.set("mcp", outcome);
  return target.toString();
}
