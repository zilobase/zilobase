import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("application composition installs shared data through its public entrypoint", () => {
  const source = readFileSync(
    join(root, "apps/web/src/app/providers/features-provider.tsx"),
    "utf8",
  );
  assert.match(source, /import .*installSharedClient.*from "@zilobase\/features\/data"/);
  assert.match(source, /installSharedClient\(queryClient/);
});
