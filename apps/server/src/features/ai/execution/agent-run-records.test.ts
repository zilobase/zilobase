import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
vi.mock("../../../infrastructure/database", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => {
                calls.push("lock");
                return [{ id: "run" }];
              },
              then: (resolve: (value: unknown) => void) => {
                calls.push("sequence");
                resolve([{ sequence: 4 }]);
              },
            }),
          }),
        }),
        insert: () => ({
          values: async (value: { sequence: number }) => {
            calls.push(`insert:${value.sequence}`);
          },
        }),
      }),
  },
}));

import type { aiAgentRun } from "../../../infrastructure/database/schema";
import { appendRunEvent, serializeRun } from "./agent-run-records";

describe("agent run records", () => {
  it("locks the parent run before allocating an event sequence", async () => {
    calls.length = 0;
    await appendRunEvent("run", "started", "shared", {});
    expect(calls).toEqual(["lock", "sequence", "insert:4"]);
  });

  it("does not expose provider diagnostics in shared summaries", () => {
    const row = {
      createdAt: new Date(),
      errorCode: "FAILED",
      errorSummary: "private provider diagnostic",
    } as typeof aiAgentRun.$inferSelect;
    expect(serializeRun(row).errorSummary).toBe("Run could not complete.");
    expect(serializeRun(row, true).errorSummary).toBe("private provider diagnostic");
    expect(serializeRun({ ...row, errorCode: null }).errorSummary).toBeNull();
  });
});
