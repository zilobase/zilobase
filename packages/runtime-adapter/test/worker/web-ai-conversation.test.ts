import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("community web AI conversation adapter", () => {
  it("owns the resumable SDK implementation and ships a community web entry", async () => {
    const [conversation, webEntry] = await Promise.all([
      readFile(new URL("../../src/worker/web/use-agent-conversation.ts", import.meta.url), "utf8"),
      readFile(new URL("../../deploy/worker/web.template.js", import.meta.url), "utf8"),
    ]);

    expect(conversation).toMatch(/useAgentChat/);
    expect(conversation).toMatch(/resume: true/);
    expect(conversation).toMatch(/chat\.isStreaming/);
    expect(conversation).toMatch(/startClosed:/);
    expect(webEntry).toMatch(/createWebGateway/);
  });
});
