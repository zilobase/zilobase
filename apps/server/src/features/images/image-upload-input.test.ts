import assert from "node:assert/strict";
import { test } from "vitest";
import {
  readString,
  readPositiveInteger,
  normalizeContentType,
  sanitizeFilename,
  getImageObjectKey,
} from "./image-upload-input";

test("image upload inputs retain numeric, MIME and object-key normalization", () => {
  assert.equal(readString("  "), undefined);
  assert.equal(readString(" name "), "name");
  assert.equal(readPositiveInteger("12"), 12);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "bad", null])
    assert.equal(readPositiveInteger(value), undefined);
  assert.equal(normalizeContentType("IMAGE/PNG; charset=utf-8"), "image/png");
  assert.equal(sanitizeFilename("../../my photo.png"), "my-photo.png");
  assert.equal(sanitizeFilename("###"), "image");
  assert.equal(sanitizeFilename("a".repeat(200)).length, 120);
  assert.equal(
    getImageObjectKey({
      workspaceId: "one/two",
      pageId: "a b",
      assetId: "asset",
      filename: "photo.png",
    }),
    "org/one-two/page/a%20b/images/asset/photo.png",
  );
});
