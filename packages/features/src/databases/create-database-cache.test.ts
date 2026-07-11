import assert from "node:assert/strict"
import test from "node:test"

import { applyCreatedDatabaseToPageNav } from "./create-database-cache"
import { createTestDatabasePayload } from "./test-helpers"
import { applyNavDelta } from "../pages/nav-delta"
import type { Page, PageNavigationPayload } from "../pages/queries"

const createdAt = "2026-06-01T00:00:00.000Z"

function createPage(id: string) {
  return {
    createdAt,
    id,
    name: id,
    workspaceId: "org-1",
    type: "pageblock",
    updatedAt: createdAt,
    url: "#",
  } satisfies Page
}

function createNavigation(pages: Page[]): PageNavigationPayload {
  return { databases: [], pages, placements: [] }
}

test("applyCreatedDatabaseToPageNav adds embedded database and placement", () => {
  const payload = createTestDatabasePayload({
    database: {
      config: {},
      id: "database-2",
      name: "New database",
      pageId: "page-root",
    },
    rows: [],
    values: [],
  })
  const next = applyCreatedDatabaseToPageNav(
    createNavigation([createPage("page-root"), createPage("page-other")]),
    payload,
  )

  assert.equal(next?.databases[0]?.id, "database-2")
  assert.deepEqual(next?.placements.at(-1), {
    id: "primary:page:page-root:database:database-2",
    itemId: "database-2",
    itemKind: "database",
    workspaceId: "org-1",
    parentId: "page-root",
    parentKind: "page",
    placementKind: "primary",
    position: 0,
    sourceRowId: null,
  })
})

test("applyCreatedDatabaseToPageNav adds standalone database without placement", () => {
  const payload = createTestDatabasePayload({
    database: {
      config: {},
      id: "database-standalone",
      name: "Standalone",
      pageId: null,
    },
    rows: [],
    values: [],
  })
  const next = applyCreatedDatabaseToPageNav(
    createNavigation([createPage("page-root")]),
    payload,
  )

  assert.equal(next?.databases[0]?.id, "database-standalone")
  assert.deepEqual(next?.placements, [])
})

test("applyNavDelta upserts created page and placement", () => {
  const next = applyNavDelta(createNavigation([createPage("page-root")]), {
    upsertPlacements: [
      {
        id: "primary-page-child",
        itemId: "page-child",
        itemKind: "page",
        workspaceId: "org-1",
        parentId: "page-root",
        parentKind: "page",
        placementKind: "primary",
        position: 0,
        sourceRowId: null,
      },
    ],
    upsertPages: [createPage("page-child")],
  })

  assert.deepEqual(
    next?.pages.map((page) => page.id),
    ["page-root", "page-child"],
  )
  assert.equal(next?.placements[0]?.itemId, "page-child")
})
