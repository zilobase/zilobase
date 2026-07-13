import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveEmbeddedItemsOpenAs,
  resolvePageFullWidth,
  usesUserEmbeddedItemsPreference,
  usesUserFullWidthPreference,
} from "./queries"

test("full width always uses the viewer preference for editable workspace pages", () => {
  assert.equal(
    resolvePageFullWidth(
      {
        metadata: {
          fullWidth: true,
          useUserFullWidthPreference: false,
        },
      },
      false,
    ),
    false,
  )
})

test("full width uses the published owner preference when provided", () => {
  assert.equal(
    resolvePageFullWidth(
      {
        metadata: {
          fullWidth: false,
          useUserFullWidthPreference: false,
        },
        publishedOwnerPreferences: { pageFullWidth: true },
      },
      false,
    ),
    true,
  )
})

test("full width preference mode remains on for legacy page metadata", () => {
  assert.equal(
    usesUserFullWidthPreference({ useUserFullWidthPreference: false }),
    true,
  )
})

test("embedded page opening always uses the viewer preference", () => {
  assert.equal(
    resolveEmbeddedItemsOpenAs(
      {
        metadata: {
          embeddedItemsOpenAs: "dialog",
          useUserEmbeddedItemsPreference: false,
        },
      },
      "sidepanel",
    ),
    "sidepanel",
  )
})

test("embedded page opening preference mode remains on for legacy metadata", () => {
  assert.equal(
    usesUserEmbeddedItemsPreference({
      useUserEmbeddedItemsPreference: false,
    }),
    true,
  )
})
