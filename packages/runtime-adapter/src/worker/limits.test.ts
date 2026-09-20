import { describe, expect, it, vi } from "vitest";
import { createWorkerLimits } from "./limits";

describe("worker Limits port", () => {
  it("delegates to the configured Rate Limit binding", async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const limits = createWorkerLimits({ COLLABORATION_RATE_LIMITER: { limit } });
    expect(await limits.consume("collaboration:user-1", 60, 60_000)).toBe(true);
    expect(limit).toHaveBeenCalledWith({ key: "collaboration:user-1" });
  });

  it("fails closed when the binding is absent", async () => {
    await expect(createWorkerLimits({}).consume("key", 1, 1_000))
      .rejects.toThrow("COLLABORATION_RATE_LIMITER binding is required");
  });
});
