import { describe, expect, it } from "vitest";

import { mcpMaterializationInputSchema } from "./materialization";

const base = {
  name: "Imported issues",
  placement: "standalone" as const,
  properties: [],
  titleSourceColumn: "title",
};

describe("MCP materialization input", () => {
  it("accepts a staged dataset without model-provided rows", () => {
    const parsed = mcpMaterializationInputSchema.parse({
      ...base,
      datasetIds: [crypto.randomUUID()],
    });

    expect(parsed.datasetIds).toHaveLength(1);
    expect(parsed.toolExecutionIds).toEqual([]);
    expect("rows" in parsed).toBe(false);
  });

  it("accepts an originating tool execution id", () => {
    const parsed = mcpMaterializationInputSchema.parse({
      ...base,
      toolExecutionIds: [crypto.randomUUID()],
    });

    expect(parsed.datasetIds).toEqual([]);
    expect(parsed.toolExecutionIds).toHaveLength(1);
  });

  it("requires an owned source reference and an inline parent", () => {
    expect(() => mcpMaterializationInputSchema.parse(base)).toThrow();
    expect(() =>
      mcpMaterializationInputSchema.parse({
        ...base,
        datasetIds: [crypto.randomUUID()],
        placement: "inline",
      }),
    ).toThrow();
  });
});
