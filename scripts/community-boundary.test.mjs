import assert from "node:assert/strict";
import test from "node:test";

import { findPrivateRuntimeReferences } from "./community-boundary.mjs";

test("community boundary ignores documentation and public service URLs", () => {
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "docs/runtime.md",
      "Cloudflare can host a community deployment with Durable Objects.",
    ),
    [],
  );
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "src/dns.ts",
      'fetch("https://cloudflare-dns.com/dns-query")',
    ),
    [],
  );
});

test("community boundary rejects private runtime dependencies", () => {
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "src/runtime.ts",
      'import { adapter } from "@zilobase/cloud-adapter"',
    ),
    ["@zilobase/cloud-adapter"],
  );
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "package.json",
      JSON.stringify({ dependencies: { "zilobase-cloud-adapter": "workspace:*" } }),
    ),
    ["zilobase-cloud-adapter"],
  );
});
