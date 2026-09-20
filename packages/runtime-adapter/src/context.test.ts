import { describe, expect, it } from "vitest";
import {
  getRuntimePorts,
  runWithRuntimePorts,
} from "./context";

describe("runtime port context", () => {
  it("isolates concurrent runtime scopes and rejects ambient lookup", async () => {
    const first = { scheduler: { after: () => () => {}, setAlarm: async () => {}, waitUntil: () => {} } };
    const second = { telemetry: { error: () => {}, event: () => {}, metrics: () => "", health: async () => ({}) } };

    const values = await Promise.all([
      runWithRuntimePorts(first, async () => {
        await Promise.resolve();
        return getRuntimePorts();
      }),
      runWithRuntimePorts(second, async () => {
        await Promise.resolve();
        return getRuntimePorts();
      }),
    ]);

    expect(values).toEqual([first, second]);
    expect(() => getRuntimePorts()).toThrow("Runtime ports context is required");
  });
});
