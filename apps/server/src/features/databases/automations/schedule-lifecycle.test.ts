import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("schedule lifecycle materializes and clears nextRunAt at every state boundary", async () => {
  const [service, engine] = await Promise.all([
    readFile(new URL("./service.ts", import.meta.url), "utf8"),
    readFile(new URL("./run-engine.ts", import.meta.url), "utf8"),
  ]);
  expect(service).toContain("nextScheduleRunAt(compilation.definition!, now)");
  expect(service).toContain("nextScheduleRunAt(current.definition, now)");
  expect(service).toContain("nextRunAt: input.paused ? null");
  expect(service.match(/nextRunAt: null/g)?.length).toBeGreaterThanOrEqual(2);
  expect(engine).toContain("nextRunAt: null");
});
