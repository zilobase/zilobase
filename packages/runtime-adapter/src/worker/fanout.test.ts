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

  it("routes page commands to the page room", async () => {
    const replacePageContent = vi.fn(async () => undefined);
    const getByName = vi.fn(() => ({ fetch: vi.fn(), replacePageContent }));
    const fanout = createWorkerFanout({ PAGE_COLLABORATION: { getByName } });
    const command = { content: { type: "doc" }, pageId: "page-1", userId: "user-1" };
    await fanout.publish("page:page-1:replace", command);
    expect(getByName).toHaveBeenCalledWith("page:page-1");
    expect(replacePageContent).toHaveBeenCalledWith(command.content, "page-1", "user-1");
  });
});
