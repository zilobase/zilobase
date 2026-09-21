// colocated with check-dep-alignment.mjs; runs under `node --test`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("check-dep-alignment", () => {
  it("passes on the aligned tree", async () => {
    const { stdout } = await execFileAsync(
      "node",
      ["scripts/check-dep-alignment.mjs", "--check-all"],
      { cwd: root, encoding: "utf8" },
    );
    assert.match(stdout, /aligned/);
  });
});
