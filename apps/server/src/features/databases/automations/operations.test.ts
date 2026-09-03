import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { selectWorkspaceRunClaims } from "./run-engine";
import { oldestAcross } from "./operations";

describe("database automation operations", () => {
  it("normalizes database timestamp strings when measuring queued work", () => {
    expect(oldestAcross([
      { oldestAt: "2026-09-03T02:07:40.000Z" },
      { oldestAt: new Date("2026-09-03T02:07:41.000Z") },
    ])).toEqual(new Date("2026-09-03T02:07:40.000Z"));
  });

  it("enforces ten concurrent runs per workspace while filling other workspace capacity", () => {
    const candidates = [
      ...Array.from({ length: 12 }, (_, index) => ({ id: `a-${index}`, workspaceId: "workspace-a" })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `b-${index}`, workspaceId: "workspace-b" })),
    ];
    const selected = selectWorkspaceRunClaims(candidates, [
      { count: 9, workspaceId: "workspace-a" },
      { count: 3, workspaceId: "workspace-b" },
    ], 10);
    expect(selected.filter((id) => id.startsWith("a-"))).toHaveLength(1);
    expect(selected.filter((id) => id.startsWith("b-"))).toHaveLength(6);
  });

  it("serializes workspace claims and recovers expired leases", async () => {
    const source = await readFile(new URL("./run-engine.ts", import.meta.url), "utf8");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("gt(databaseAutomationRun.leaseExpiresAt, now)");
    expect(source).toContain("lte(databaseAutomationRun.leaseExpiresAt, now)");
    expect(source).toContain("WORKSPACE_RUN_LIMIT = 10");
    expect(source).toContain('.limit(250)');
    expect(source).toContain("if (claimed.deferred) throw new AutomationRunCapacityError()");
  });

  it("uses bounded terminal-history cleanup and emits redacted aggregate health", async () => {
    const [operations, health, service] = await Promise.all([
      readFile(new URL("./operations.ts", import.meta.url), "utf8"),
      readFile(new URL("../../health/routes.ts", import.meta.url), "utf8"),
      readFile(new URL("./service.ts", import.meta.url), "utf8"),
    ]);
    expect(operations).toContain("CLEANUP_BATCH = 1_000");
    expect(operations).toContain('["succeeded", "failed", "skipped", "cancelled"]');
    expect(operations).toContain('["completed", "discarded"]');
    expect(operations).not.toContain("definition:");
    expect(health).toContain("AUTOMATION_OPERATIONS_TOKEN");
    expect(health).toContain("equalSecret");
    expect(service).toContain("exportDatabaseAutomationAudit");
    expect(service).toContain("dependencyCounts");
    expect(service).not.toContain("accessTokenCiphertext:");
  });

  it("stops evaluation, schedule materialization, and run claims behind one kill switch", async () => {
    const sources = await Promise.all(["evaluator.ts", "scheduler.ts", "run-engine.ts"].map((name) =>
      readFile(new URL(`./${name}`, import.meta.url), "utf8")
    ));
    for (const source of sources) expect(source).toContain("isDatabaseAutomationExecutionEnabled(env)");
  });
});
