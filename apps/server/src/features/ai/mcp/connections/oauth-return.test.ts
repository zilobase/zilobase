import { describe, expect, it } from "vitest";
import { mcpOAuthReturnUrl, safeAgentReturnPath } from "./oauth-return";

describe("MCP OAuth return routing", () => {
  it.each(["connected", "failed"] as const)("restores personal settings after %s", (outcome) => {
    const url = new URL(mcpOAuthReturnUrl("https://app.example", { type: "personal" }, outcome));
    expect(url.pathname).toBe("/ai");
    expect(url.searchParams.get("settingsTab")).toBe("connectors");
    expect(url.searchParams.get("mcp")).toBe(outcome);
  });
  it.each(["connected", "failed"] as const)(
    "restores standalone agent tools after %s",
    (outcome) => {
      const url = new URL(
        mcpOAuthReturnUrl(
          "https://app.example",
          { type: "agent", agentProfileId: "agent-id" },
          outcome,
        ),
      );
      expect(url.pathname).toBe("/agents/agent-id");
      expect(url.searchParams.get("settingsTab")).toBe("connectors");
      expect(url.searchParams.has("agent")).toBe(false);
    },
  );
  it("does not turn a stored identifier into an external redirect", () => {
    const url = new URL(
      mcpOAuthReturnUrl(
        "https://app.example",
        { type: "agent", agentProfileId: "//attacker.example/?secret" },
        "connected",
      ),
    );
    expect(url.origin).toBe("https://app.example");
    expect(url.searchParams.has("secret")).toBe(false);
  });
});

describe("conversation OAuth return paths", () => {
  it.each(["connected", "failed"] as const)("preserves conversation and panel on %s", (outcome) => {
    const result = new URL(
      mcpOAuthReturnUrl(
        "https://app.example",
        { type: "personal" },
        outcome,
        "/ai?thread=chat-1&panel=settings&settingsTab=instructions#message-2",
      ),
    );
    expect(result.searchParams.get("thread")).toBe("chat-1");
    expect(result.searchParams.get("settingsTab")).toBe("instructions");
    expect(result.hash).toBe("#message-2");
  });
  it.each([
    "https://evil.example/ai",
    "//evil.example/ai",
    "/\\evil.example/ai",
    "/settings",
    "/ai/../../evil",
    "/ai\n",
  ])("rejects unsafe return %s", (value) => expect(safeAgentReturnPath(value)).toBeNull());
  it("preserves the custom agent conversation", () =>
    expect(safeAgentReturnPath("/agents/agent-1?panel=settings&settingsTab=connectors")).toBe(
      "/agents/agent-1?panel=settings&settingsTab=connectors",
    ));
});
