import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Worker runtime context boundary", () => {
  it("wraps the complete request dispatcher rather than only Hono requests", async () => {
    const workerSource = await readFile(fileURLToPath(new URL(
      "../../src/worker/worker.ts",
      import.meta.url,
    )), "utf8");

    expect(workerSource).toMatch(
      /async fetch\(request: Request, env: Env, ctx: ExecutionContext\)[\s\S]*?return runWithRuntimePorts\(portsFor\(env, ctx\), async \(\) => \{/,
    );
    expect(workerSource).toMatch(
      /async function fetchApp\([\s\S]*?\{\n\s+return runWithDbRequest\(env, \(\) => appHandler\.fetch\(request, env, ctx\)\);\n\s+\}/,
    );
  });

  it("installs runtime ports for collaboration Durable Object events", async () => {
    const roomSource = await readFile(fileURLToPath(new URL(
      "../../src/worker/features/collaboration/page-collaboration-room.ts",
      import.meta.url,
    )), "utf8");

    expect(roomSource).toMatch(/createWorkerRuntimePorts\(env, \{/);
    expect(roomSource).toMatch(
      /async webSocketMessage[\s\S]*?this\.runWithRoomRuntime/,
    );
    expect(roomSource).toMatch(
      /protected runWithRoomRuntime[\s\S]*?runWithRuntimePorts\(this\.runtimePorts, run\)/,
    );
  });
});
