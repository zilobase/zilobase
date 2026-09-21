import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveEmbeddedItemsOpenAs,
  resolvePageFullWidth,
} from "./queries"

test("full width always uses the viewer preference for editable workspace pages", () => {
  assert.equal(
    resolvePageFullWidth(
      {},
      false,
    ),
    false,
  )
})

test("full width uses the published owner preference when provided", () => {
  assert.equal(
    resolvePageFullWidth(
      {
        publishedOwnerPreferences: { pageFullWidth: true },
      },
      false,
    ),
    true,
  )
})

test("embedded page opening always uses the viewer preference", () => {
  assert.equal(
    resolveEmbeddedItemsOpenAs("sidepanel"),
    "sidepanel",
  )
})
