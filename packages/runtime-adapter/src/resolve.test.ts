import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { loadRuntime } from "./dispatcher";
import { resolveRuntimeKind } from "./resolve";

test("resolveRuntimeKind selects only an explicitly configured worker runtime", () => {
  assert.equal(resolveRuntimeKind({ ZILOBASE_RUNTIME_KIND: "worker" }), "worker");
  assert.equal(resolveRuntimeKind({ HYPERDRIVE: { connectionString: "postgres://x" } }), "node");
  assert.throws(
    () => resolveRuntimeKind({ ZILOBASE_RUNTIME_KIND: "edge" }),
    /node.*worker/,
  );
});

test("resolveRuntimeKind defaults to node", () => {
  assert.equal(resolveRuntimeKind({}), "node");
  assert.equal(resolveRuntimeKind({ DATABASE_URL: "postgres://x", ZILOBASE_RUNTIME_KIND: "node" }), "node");
});

test("dispatcher lazily loads one runtime side via dynamic import only", async () => {
  const source = await readFile(new URL("./dispatcher.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\/(node|worker)\//);
  assert.match(source, /import\("\.\/worker\/index"\)/);
  assert.match(source, /import\("\.\/node\/index"\)/);

  const node = await loadRuntime("node");
  assert.equal(typeof node.createNodeRuntime, "function");
  assert.equal(typeof node.startNodeServer, "function");
});
