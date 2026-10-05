import assert from "node:assert/strict";
import { test } from "vitest";
import { withSourceClocks } from "./source-clocks";

test("source confirmations expose only the lane represented in the event", () => {
  assert.deepEqual(
    withSourceClocks({ removedRecordIds: ["row"] }, "source", { source: 7, "transfer-peer": 99 }),
    { removedRecordIds: ["row"], sourceVersions: { source: 7 } },
  );
  assert.deepEqual(withSourceClocks({}, null, { secret: 42 }), {});
  assert.throws(() => withSourceClocks({}, "unknown", {}), /Missing source confirmation clock/);
});
