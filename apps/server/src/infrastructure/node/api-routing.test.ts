import assert from "node:assert/strict";
import { test } from "vitest";

import { isNodeApiPath } from "./api-routing";

test("the combined Node runtime sends discovery and probes to the API", () => {
  for (const path of [
    "/.well-known/zilobase",
    "/health",
    "/ready",
    "/api/auth/session",
  ]) {
    assert.equal(isNodeApiPath(path), true, path);
  }

  for (const path of ["/", "/desktop", "/assets/app.js", "/health-check"]) {
    assert.equal(isNodeApiPath(path), false, path);
  }
});
