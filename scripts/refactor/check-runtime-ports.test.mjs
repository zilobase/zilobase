import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkRuntimeBoundaries } from "./check-runtime-ports.mjs";

test("feature boundary rejects runtime providers and ambient adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-ports-boundary-"));
  try {
    await mkdir(join(root, "apps/server/src/features/example"), { recursive: true });
    await mkdir(join(root, "packages/features/src/example"), { recursive: true });
    await writeFile(join(root, "apps/server/src/features/example/bad.ts"),
      'import "@zilobase/runtime-adapter/worker"; getRuntimeAdapter();\n');
    await writeFile(join(root, "packages/features/src/example/good.ts"),
      'export const publish = (ports, value) => ports.fanout.publish("x", value);\n');
    assert.deepEqual(checkRuntimeBoundaries(root), [
      "apps/server/src/features/example/bad.ts: ambient runtime adapter",
      "apps/server/src/features/example/bad.ts: Worker runtime provider import",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
