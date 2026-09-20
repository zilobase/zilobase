import { describe, expect, it, vi } from "vitest";

import { createNodeFanout } from "./fanout";

describe("node fanout port", () => {
  it("publishes locally exactly once and delegates subscriptions to Redis", async () => {
    const unsubscribe = vi.fn(async () => undefined);
    const subscribe = vi.fn(async () => unsubscribe);
    const publishLocal = vi.fn(async () => undefined);
    const fanout = createNodeFanout({ subscribe } as never, publishLocal);
    const payload = { type: "mail.invalidate" };

    await fanout.publish("mail:binding-1", payload);
    const handler = vi.fn();
    expect(await fanout.subscribe("mail:binding-1", handler)).toBe(unsubscribe);

    expect(publishLocal).toHaveBeenCalledOnce();
    expect(publishLocal).toHaveBeenCalledWith("mail:binding-1", payload);
    expect(subscribe).toHaveBeenCalledWith("mail:binding-1", handler);
  });
});
