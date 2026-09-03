import assert from "node:assert/strict";
import test from "node:test";

import {
  findPrivateRuntimeReferences,
  isMissingWorkingTreeFile,
} from "./community-boundary.mjs";

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
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "src/runtime.ts",
      'import { runtime } from "@zilobase/enterprise"',
    ),
    ["@zilobase/enterprise"],
  );
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "scripts/dev/private-profile.mjs",
      'const directory = "../zilobase-enterprise";',
    ),
    ["private-edition repository marker"],
  );
  assert.deepEqual(
    findPrivateRuntimeReferences("scripts/dev/enterprise-profile.mjs", "export {}"),
    ["private-edition repository marker"],
  );
  assert.deepEqual(
    findPrivateRuntimeReferences(
      "apps/web/src/routes.ts",
      'const path = "/enterprise/audit";',
    ),
    ["private-edition repository marker"],
  );
});

test("community boundary skips files deleted from the working tree", () => {
  assert.equal(
    isMissingWorkingTreeFile(Object.assign(new Error("missing"), { code: "ENOENT" })),
    true,
  );
  assert.equal(
    isMissingWorkingTreeFile(Object.assign(new Error("denied"), { code: "EACCES" })),
    false,
  );
});
