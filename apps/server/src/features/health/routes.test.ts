import assert from "node:assert/strict";
import { test } from "vitest";

import { healthRoutes } from "./routes";

test("root and health probes return the stable service contract", async () => {
  for (const path of ["/", "/health"]) {
    const response = await healthRoutes.request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "zilobase-server",
    });
  }
});
