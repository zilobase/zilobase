import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { checkLinks, captureExports, compareExports } from "./check-architecture.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "zilobase-architecture-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("links resolve relative targets and duplicate heading anchors, ignoring fenced examples", () =>
  fixture((root) => {
    writeFileSync(join(root, "target.md"), "# Section\n# Section\n");
    const page = join(root, "README.md");
    writeFileSync(
      page,
      "[valid](target.md#section-1)\n[external](https://example.test/missing)\n```md\n[example](missing.md)\n```\n",
    );
    assert.deepEqual(checkLinks([page]), []);
    writeFileSync(page, "[missing](missing.md)\n[anchor](target.md#missing)\n[ref]: absent.md\n");
    assert.equal(checkLinks([page]).length, 3);
  }));

test("published exports survive implementation moves and re-exports, but removals fail", () =>
  fixture((root) => {
    const pkg = join(root, "pkg");
    mkdirSync(pkg);
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "fixture",
        exports: { ".": { types: "./index.ts", default: "./index.ts" } },
      }),
    );
    writeFileSync(
      join(pkg, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler", skipLibCheck: true },
      }),
    );
    writeFileSync(
      join(pkg, "index.ts"),
      "export function run() { return 1 }; export type Input = { id: string };\n",
    );
    const baseline = captureExports(root, ["pkg"]);
    writeFileSync(
      join(pkg, "moved.ts"),
      "export function run() { return 1 }; export type Input = { id: string };\n",
    );
    writeFileSync(
      join(pkg, "index.ts"),
      'export { run, type Input } from "./moved"; export const added = 1;\n',
    );
    assert.deepEqual(compareExports(baseline, captureExports(root, ["pkg"])), []);
    writeFileSync(join(pkg, "index.ts"), "export type run = string;\n");
    const errors = compareExports(baseline, captureExports(root, ["pkg"]));
    assert.ok(errors.some((error) => error.includes("Changed export kind")));
    assert.ok(errors.some((error) => error.includes("Removed export:")));
    assert.ok(
      compareExports(baseline, {}).every((error) =>
        error.includes("Removed export condition/subpath"),
      ),
    );
  }));
