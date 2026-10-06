import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_TASK_KINDS,
  backgroundTaskLane,
} from "../../infrastructure/background/contracts";
import { createBackgroundTaskV2 } from "../../infrastructure/background/task-v2";
import { runBackgroundDelivery } from "./delivery";

describe.each(["node", "worker"])("%s shared delivery conformance", () => {
  const fixture = (kind: (typeof BACKGROUND_TASK_KINDS)[number] = "ai.job") => {
    const task = createBackgroundTaskV2({
      env: { ZILOBASE_CELL_ID: "a" },
      kind,
      resourceId: "r",
      availableAt: new Date(0),
    });
    let finished = false;
    const store = {
      load: vi.fn(async () => (finished ? ("done" as const) : ("ready" as const))),
      complete: vi.fn(async () => {
        finished = true;
      }),
      reschedule: vi.fn(async () => {
        finished = true;
      }),
    };
    const execute = vi.fn(async () => ({ outcome: "completed" as const }));
    const input = {
      body: task,
      cellId: "a",
      lane: backgroundTaskLane(kind),
      store,
      execute,
      now: 10_000,
    };
    return { task, store, execute, input };
  };
  it.each(BACKGROUND_TASK_KINDS)("executes %s once after persisted completion", async (kind) => {
    const f = fixture(kind);
    expect(await runBackgroundDelivery(f.input)).toEqual({ outcome: "ack" });
    expect(await runBackgroundDelivery(f.input)).toEqual({ outcome: "ack" });
    expect(f.execute).toHaveBeenCalledOnce();
  });
  it("rejects foreign cells, lanes, versions and oversized messages before execution", async () => {
    const f = fixture();
    for (const input of [
      { ...f.input, cellId: "b" },
      { ...f.input, lane: "fast" as const },
      { ...f.input, body: { ...f.task, version: 1 } },
      { ...f.input, body: { ...f.task, resourceId: "x".repeat(20_000) } },
    ])
      await expect(runBackgroundDelivery(input)).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("defers early messages without executing or consuming a business attempt", async () => {
    const f = fixture();
    const availableAt = new Date(20_000).toISOString();
    expect(await runBackgroundDelivery({ ...f.input, body: { ...f.task, availableAt } })).toEqual({
      outcome: "defer",
      availableAt,
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("acknowledges business retries only after next intent persists", async () => {
    const f = fixture();
    const availableAt = new Date(30_000).toISOString();
    const execute = vi.fn(async () => ({ outcome: "retry" as const, availableAt }));
    await runBackgroundDelivery({ ...f.input, execute });
    expect(f.store.reschedule).toHaveBeenCalledWith(f.task, availableAt);
    f.store.load.mockResolvedValue("ready");
    f.store.reschedule.mockRejectedValue(new Error("commit failed"));
    await expect(runBackgroundDelivery({ ...f.input, execute })).rejects.toThrow("commit failed");
  });
  it("leaves unexpected exceptions to broker redelivery", async () => {
    const f = fixture();
    await expect(
      runBackgroundDelivery({
        ...f.input,
        execute: async () => {
          throw new Error("network");
        },
      }),
    ).rejects.toThrow("network");
    expect(f.store.complete).not.toHaveBeenCalled();
  });
});
