import { describe, expect, it, vi } from "vitest";
import { createNodeLimits } from "./limits";

describe("node Limits port", () => {
  it("uses an in-process fixed window without Redis", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limits = createNodeLimits(null);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(true);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(true);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(false);
    vi.setSystemTime(1_000);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(true);
    vi.useRealTimers();
  });

  it("delegates distributed limits to the realtime bus", async () => {
    const consumeLimit = vi.fn(async () => false);
    const limits = createNodeLimits({ consumeLimit } as never);
    expect(await limits.consume("user:1", 2, 1_000)).toBe(false);
    expect(consumeLimit).toHaveBeenCalledWith("user:1", 2, 1_000);
  });
});
