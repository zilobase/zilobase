import assert from "node:assert/strict";
import { test } from "vitest";

import { decodeBookmarkUrl } from "./bookmark-metadata";

test("bookmark URL schema accepts public hosts and rejects private ones", () => {
  assert.equal(decodeBookmarkUrl("example.test/path"), "https://example.test/path");
  assert.equal(decodeBookmarkUrl(" https://example.test "), "https://example.test/");

  assert.throws(() => decodeBookmarkUrl(""));
  assert.throws(() => decodeBookmarkUrl("localhost"));
  assert.throws(() => decodeBookmarkUrl("127.0.0.1"));
});
