import assert from "node:assert/strict"
import test from "node:test"

import {
  databasePropertyTypes,
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
  normalizeDatabasePropertyType,
  shouldClearValuesForPropertyTypeChange,
} from "./property-types"

test("database property type helpers expose the canonical contract", () => {
  for (const type of databasePropertyTypes) {
    assert.equal(normalizeDatabasePropertyType(type), type)
  }

  assert.equal(normalizeDatabasePropertyType(undefined), "text")
  assert.equal(normalizeDatabasePropertyType(" STATUS "), "status")
  assert.equal(normalizeDatabasePropertyType(123), null)
  assert.equal(normalizeDatabasePropertyType("made_up"), null)
  assert.equal(isReadOnlyPropertyType("created_time"), true)
  assert.equal(isReadOnlyPropertyType("date"), false)
  assert.equal(isSelectLikePropertyType("multi_select"), true)
  assert.equal(isSelectLikePropertyType("person"), false)
  assert.equal(shouldClearValuesForPropertyTypeChange("text", "files"), true)
  assert.equal(shouldClearValuesForPropertyTypeChange("files", "files"), false)
  assert.equal(shouldClearValuesForPropertyTypeChange("text", "person"), true)
  assert.equal(
    shouldClearValuesForPropertyTypeChange("person", "person"),
    false
  )
  assert.equal(
    shouldClearValuesForPropertyTypeChange("date", "created_time"),
    true
  )
  assert.equal(shouldClearValuesForPropertyTypeChange("date", "select"), true)
  assert.equal(
    shouldClearValuesForPropertyTypeChange("date", "multi_select"),
    true
  )
  assert.equal(shouldClearValuesForPropertyTypeChange("date", "status"), true)
  assert.equal(shouldClearValuesForPropertyTypeChange("text", "select"), false)
  assert.equal(shouldClearValuesForPropertyTypeChange("number", "text"), false)
})
