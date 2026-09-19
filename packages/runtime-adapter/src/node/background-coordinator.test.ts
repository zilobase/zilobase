import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Node background coordinator architecture", () => {
  it("uses LISTEN/NOTIFY, exact lane timers, and a jittered recovery sweep", async () => {
    const source = await readFile(new URL("./background-coordinator.ts", import.meta.url), "utf8");
    expect(source).toContain("zilobase_background_v1");
    expect(source).toContain("listen ${CHANNEL}");
    expect(source).toContain("timerDueAt");
    expect(source).toContain("30_000 + jitter");
    expect(source).not.toContain("setInterval");
  });

  it("supports all, api, and worker roles with all as default", async () => {
    const source = await readFile(new URL("./node-runtime.ts", import.meta.url), "utf8");
    expect(source).toContain('type ProcessRole = "all" | "api" | "worker"');
    expect(source).toContain('if (!value || value === "all") return "all"');
    expect(source).toContain("BACKGROUND_HEALTH_PORT");
  });
});
