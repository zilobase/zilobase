import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const data = join(root, "packages/features/src/data");

test("foundation imports public package entrypoints and avoids internal APIs", () => {
  for (const file of ["collection.ts", "session.ts", "publication.ts", "index.ts", "react.ts"]) {
    const source = readFileSync(join(data, file), "utf8");
    assert.doesNotMatch(source, /\.(?:_state|_sync|_deferPublication|startSyncImmediate)\b/, file);
    assert.doesNotMatch(source, /@tanstack\/db\//, file);
  }
  assert.doesNotMatch(readFileSync(join(data, "index.ts"), "utf8"), /\.\/react/);
});

test("preparatory shared data has no active application imports", () => {
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.tsx?$/.test(entry.name))
        assert.doesNotMatch(
          readFileSync(path, "utf8"),
          /@zilobase\/features\/data(?:[/'"]|$)/,
          path,
        );
    }
  }
  inspect(join(root, "apps/web/src"));
});
