import { describe, expect, it } from "vitest";
import {
  getRuntimePorts,
  runWithRuntimePorts,
  setRuntimePorts,
} from "./context";

describe("runtime port context", () => {
  it("isolates concurrent request ports and retains the process fallback", async () => {
    const fallback = { jobs: { dispatch: async () => {}, drain: async () => {} } };
    const first = { scheduler: { after: () => () => {}, setAlarm: async () => {}, waitUntil: () => {} } };
    const second = { telemetry: { error: () => {}, event: () => {}, metrics: () => "", health: async () => ({}) } };
    setRuntimePorts(fallback);

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
    expect(getRuntimePorts()).toBe(fallback);
  });
});
