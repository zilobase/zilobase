import { expect, test } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { currentQuestion, resolveIntentTeamspaces, routeSearchIntent } from "./intent";

test("routing sees only the current question and validates the structured decision", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      expect(JSON.stringify(prompt)).toContain("Summarize the matching pages");
      expect(JSON.stringify(prompt)).not.toContain("Mentioned sources");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ mode: "read", keywordQuery: null, teamspaceNames: [] }),
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        warnings: [],
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
      };
    },
  });
  const result = await routeSearchIntent(
    model,
    "Mentioned sources (references only): []\n\nUser question:\nSummarize the matching pages",
    new AbortController().signal,
  );
  expect(result.intent.mode).toBe("read");
  expect(model.doGenerateCalls[0]!.tools).toBeUndefined();
});

test("named locations resolve only unique authorized exact names without replacing keywords", () => {
  const intent = {
    mode: "list" as const,
    keywordQuery: "support macros",
    teamspaceNames: [" GENERAL "],
  };
  expect(resolveIntentTeamspaces(intent, [{ id: "allowed", name: "General" }])).toMatchObject({
    keywordQuery: "support macros",
    teamspaceIds: ["allowed"],
  });
  expect(resolveIntentTeamspaces(intent, [])).toHaveProperty("locationIssue");
  expect(
    resolveIntentTeamspaces(intent, [
      { id: "one", name: "General" },
      { id: "two", name: "general" },
    ]),
  ).toHaveProperty("locationIssue");
  expect(currentQuestion("Find a page")).toBe("Find a page");
});
