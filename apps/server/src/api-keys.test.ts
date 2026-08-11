import assert from "node:assert/strict";
import { test } from "vitest";

import { readApiKeyFromHeaders } from "./api-keys";

test("API key headers do not consume bearer session tokens", () => {
  assert.equal(
    readApiKeyFromHeaders(new Headers({ authorization: "Bearer session-token" })),
    null,
  );
  assert.equal(
    readApiKeyFromHeaders(new Headers({ authorization: "Bearer nl_secret" })),
    "nl_secret",
  );
  assert.equal(
    readApiKeyFromHeaders(new Headers({ "x-api-key": "custom-key" })),
    "custom-key",
  );
});
