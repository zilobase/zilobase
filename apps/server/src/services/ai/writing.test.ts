import { MockLanguageModelV4 } from "ai/test";
import { expect, test, vi } from "vitest";
import type { ServerOperationContext } from "../operations/context";

const authorize = vi.hoisted(() => vi.fn());
vi.mock("./context", () => ({ authorizeChatWorkspace: authorize }));
const { writeWithAi } = await import("./writing");

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const context = {} as ServerOperationContext;

test("selection rewrites authorize the workspace and send the selection, context and instruction", async () => {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      return {
        content: [{ type: "text", text: "```markdown\nA **clearer** sentence.\n```" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });
  const result = await writeWithAi(
    context,
    {
      workspaceId: "org",
      instruction: "Improve the writing",
      selection: "A unclear sentence.",
      context: "# Notes",
    },
    () => model,
  );
  expect(authorize).toHaveBeenCalledWith(context, "org");
  expect(result).toEqual({ markdown: "A **clearer** sentence." });
  const prompt = JSON.stringify(prompts[0]);
  for (const part of [
    "<selection>",
    "A unclear sentence.",
    "<surrounding_text>",
    "Improve the writing",
  ])
    expect(prompt).toContain(part);
});

test("requests are validated before reaching the model", async () => {
  await expect(
    writeWithAi(context, { workspaceId: "org", instruction: " " }, () => {
      throw new Error("model should not be created");
    }),
  ).rejects.toThrow();
});
