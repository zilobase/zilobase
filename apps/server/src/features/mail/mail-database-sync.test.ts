import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { isMailDatabaseMappingCompatible } from "./mail-database-sync"

test("mail fields only map to compatible destination property types", () => {
  assert.equal(isMailDatabaseMappingCompatible("address", "email"), true)
  assert.equal(isMailDatabaseMappingCompatible("address", "number"), false)
  assert.equal(isMailDatabaseMappingCompatible("files", "files"), true)
  assert.equal(isMailDatabaseMappingCompatible("files", "text"), false)
  assert.equal(isMailDatabaseMappingCompatible("select", "status"), true)
  assert.equal(isMailDatabaseMappingCompatible("boolean", "checkbox"), true)
})

test("database sync validation is workspace-bound, explicit, and new-only", async () => {
  const source = await readFile(new URL("./mail-database-sync.ts", import.meta.url), "utf8")
  assert.match(source, /requireDatabaseEditAccess/)
  assert.match(source, /requireDataSourceEditAccess/)
  assert.match(source, /databaseRecord\.workspaceId !== input\.workspaceId/)
  assert.match(source, /databaseDataSource/)
  assert.match(source, /sourcePropertyId === "subject" && mapping\.destinationPropertyId === "title"/)
  assert.match(source, /previousConfig\?\.databaseSync\.enabled/)
  assert.match(source, /new Date\(\)\.toISOString\(\)/)
})
