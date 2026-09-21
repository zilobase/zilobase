import { describe, expect, it, vi } from "vitest";
import { createNodeLimits } from "./limits";

describe("node Limits port", () => {
  it("always delegates distributed limits to the realtime bus", async () => {
    const consumeLimit = vi.fn(async () => false);
    const limits = createNodeLimits({ consumeLimit } as never);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(false);
    expect(consumeLimit).toHaveBeenCalledWith("user:1", 2, 1_000);
  });
});
