import assert from "node:assert/strict";
import test from "node:test";

import {
  findRestrictedRuntimeReferences,
  isMissingWorkingTreeFile,
  isVendoredReferenceTree,
} from "./community-boundary.mjs";

test("community boundary uses externally configured restricted markers", () => {
  process.env.ZILOBASE_RESTRICTED_PACKAGE_MARKERS = "@restricted/runtime,restricted-addon";
  process.env.ZILOBASE_RESTRICTED_PATH_PATTERN = "restricted-addon";
  try {
    assert.deepEqual(
      findRestrictedRuntimeReferences(
        "src/runtime.ts",
        'import { adapter } from "@restricted/runtime"',
      ),
      ["@restricted/runtime"],
    );
    assert.deepEqual(
      findRestrictedRuntimeReferences(
        "package.json",
        JSON.stringify({ dependencies: { "restricted-addon": "workspace:*" } }),
      ),
      ["restricted runtime marker"],
    );
    assert.deepEqual(
      findRestrictedRuntimeReferences("scripts/dev/restricted-addon.mjs", "export {}"),
      ["restricted runtime marker"],
    );
  } finally {
    delete process.env.ZILOBASE_RESTRICTED_PACKAGE_MARKERS;
    delete process.env.ZILOBASE_RESTRICTED_PATH_PATTERN;
  }
});

test("SSO and Enterprise names are reserved for public boundary policy", () => {
  assert.deepEqual(
    findRestrictedRuntimeReferences(
      "apps/server/src/private-feature.ts",
      "export const feature = 'enterprise SSO';",
    ),
    [
      "private feature implementation term: ENTERPRISE",
      "private feature implementation term: SSO",
    ],
  );
  assert.deepEqual(
    findRestrictedRuntimeReferences(
      "architecture/platform/edition-integration.md",
      "SSO and Enterprise implementations stay outside this repository.",
    ),
    [],
  );
});

test("community boundary ignores documentation and vendored references", () => {
  process.env.ZILOBASE_RESTRICTED_PACKAGE_MARKERS = "@restricted/runtime";
  try {
    assert.deepEqual(
      findRestrictedRuntimeReferences(
        "docs/runtime.md",
        'import { adapter } from "@restricted/runtime"',
      ),
      [],
    );
    assert.equal(isVendoredReferenceTree("repos/vendor/package.ts"), true);
    assert.equal(isVendoredReferenceTree(".claude/skills/reference.md"), true);
    assert.deepEqual(
      findRestrictedRuntimeReferences(
        "repos/vendor/package.ts",
        'import type { Runtime } from "@restricted/runtime"',
      ),
      [],
    );
  } finally {
    delete process.env.ZILOBASE_RESTRICTED_PACKAGE_MARKERS;
  }
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
