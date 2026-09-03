import assert from "node:assert/strict"
import test from "node:test"

import {
  databaseAutomationCapabilityQueryOptions,
  databaseAutomationKeys,
  databaseAutomationListQueryOptions,
} from "./queries"
import type { ApiFetcher } from "../../shared/context"

test("automation query keys are isolated from database payload caches", () => {
  assert.deepEqual(databaseAutomationKeys.list("database-1", "source-1"), [
    "database-automations",
    "list",
    "database-1",
    "source-1",
  ])
  assert.notDeepEqual(
    databaseAutomationKeys.list("database-1", "source-1"),
    databaseAutomationKeys.list("database-1", "source-2"),
  )
})

test("automation queries address source-aware and capability APIs", async () => {
  const paths: string[] = []
  const apiFetch: ApiFetcher = async <T>(path: string) => {
    paths.push(path)
    return { automations: [] } as T
  }
  await databaseAutomationListQueryOptions(apiFetch, "database 1", "source 1").queryFn!({} as never)
  await databaseAutomationCapabilityQueryOptions(apiFetch, "database 1", "workspace 1").queryFn!({} as never)
  assert.deepEqual(paths, [
    "/databases/database%201/automations?dataSourceId=source%201",
    "/databases/database%201/automation-capability?workspaceId=workspace%201",
  ])
})
