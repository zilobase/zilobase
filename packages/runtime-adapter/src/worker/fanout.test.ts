import { describe, expect, it, vi } from "vitest";
import { createWorkerFanout } from "./fanout";

describe("worker FanoutBus", () => {
  it("routes database channels to the named single-writer room", async () => {
    const publishMutation = vi.fn(async () => undefined);
    const getByName = vi.fn(() => ({ publishMutation }));
    const fanout = createWorkerFanout({ DATABASE_COLLABORATION: { getByName } });
    const event = { databaseId: "database-1", version: 2 };
    await fanout.publish("db:database-1", event);
    expect(getByName).toHaveBeenCalledWith("database-1");
    expect(publishMutation).toHaveBeenCalledWith(event);
  });

  it("uses a no-op subscription in a single-writer runtime", async () => {
    const unsubscribe = await createWorkerFanout({}).subscribe("db:one", () => {});
    expect(unsubscribe()).toBeUndefined();
  });
});
