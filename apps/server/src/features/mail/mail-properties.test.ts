import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const readMailRouteSources = async () => (await Promise.all([
  "organization-routes.ts", "route-support.ts",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n")

test("mail property service validates all supported types and binding ownership", async () => {
  const source = await readFile(new URL("./mail-properties.ts", import.meta.url), "utf8")

  assert.match(source, /mailCustomPropertyTypes\.includes/)
  assert.match(source, /eq\(mailProperty\.bindingId, input\.bindingId\)/)
  assert.match(source, /eq\(mailThreadIndex\.gmailAccountId, gmailAccountId\)/)
  assert.match(source, /existing\.type !== value\.type[\s\S]*delete\(mailThreadPropertyValue\)/)
  for (const type of ["text", "number", "select", "multi_select", "status", "date", "person", "checkbox", "url", "files"]) {
    assert.ok(source.includes(`property.type === "${type}"`), `missing value validation for ${type}`)
  }
})

test("person property choices and values use active workspace members", async () => {
  const source = await readFile(new URL("./mail-properties.ts", import.meta.url), "utf8")

  assert.match(source, /eq\(member\.organizationId, workspaceId\)/)
  assert.match(source, /isNull\(member\.accessExpiresAt\)/)
  assert.match(source, /gt\(member\.accessExpiresAt, new Date\(\)\)/)
  assert.match(source, /inArray\(member\.userId, userIds\)/)
})

test("workspace routes expose property definition and thread-value CRUD", async () => {
  const source = await readMailRouteSources()
  for (const route of [
    'get("/properties"',
    'post("/properties"',
    'patch("/properties/:propertyId"',
    'delete("/properties/:propertyId"',
    'get("/threads/:threadId/properties"',
    'put("/threads/:threadId/properties/:propertyId"',
  ]) assert.ok(source.includes(route), `missing ${route}`)
  assert.match(source, /requireWorkspaceMailBinding/)
})
