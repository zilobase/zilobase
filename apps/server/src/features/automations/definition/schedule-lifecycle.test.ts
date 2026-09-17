import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("schedule lifecycle materializes and clears nextRunAt at every state boundary", async () => {
  const [service, engine] = await Promise.all([
    Promise.all(["definition-lifecycle.ts", "definition-catalog.ts", "definition-context.ts"].map((name) =>
      readFile(new URL(`./${name}`, import.meta.url), "utf8")
    )).then((sources) => sources.join("\n")),
    readFile(new URL("../execution/run-lifecycle.ts", import.meta.url), "utf8"),
  ]);
  expect(service).toContain("nextScheduleRunAt(compilation.definition!, now)");
  expect(service).toContain("nextScheduleRunAt(current.definition, now)");
  expect(service).toContain("nextRunAt: input.paused ? null");
  expect(service.match(/nextRunAt: null/g)?.length).toBeGreaterThanOrEqual(2);
  expect(engine).toContain("nextRunAt: null");
});
