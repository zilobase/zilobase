import assert from "node:assert/strict"
import test from "node:test"

import {
  applyDatabaseFavoriteToNav,
  applyItemVisitToNav,
  applyWorkspaceFavoriteToNav,
} from "./nav-delta"
import type { Workspace } from "./queries"

const createdAt = "2026-06-01T00:00:00.000Z"

function createWorkspace(
  id: string,
  databases: Workspace["databases"] = [],
) {
  return {
    createdAt,
    databases,
    id,
    name: id,
    navigationPlacements: [],
    organizationId: "org-1",
    type: "pageblock",
    updatedAt: createdAt,
    url: "#",
  } satisfies Workspace
}

test("applyItemVisitToNav patches workspace visits without replacing other items", () => {
  const next = applyItemVisitToNav(
    [createWorkspace("page-1"), createWorkspace("page-2")],
    {
      itemId: "page-2",
      itemKind: "workspace",
      lastVisitedAt: "2026-07-01T04:10:00.000Z",
    },
  )

  assert.equal(next?.[0]?.lastVisitedAt, undefined)
  assert.equal(next?.[1]?.lastVisitedAt, "2026-07-01T04:10:00.000Z")
})

test("applyItemVisitToNav patches database visits inside workspace nav", () => {
  const next = applyItemVisitToNav(
    [
      createWorkspace("page-1", [
        {
          createdAt,
          id: "database-1",
          name: "Tasks",
          organizationId: "org-1",
          pageId: "page-1",
          updatedAt: createdAt,
          views: [],
        },
      ]),
    ],
    {
      itemId: "database-1",
      itemKind: "database",
      lastVisitedAt: "2026-07-01T04:11:00.000Z",
    },
  )

  assert.equal(
    next?.[0]?.databases?.[0]?.lastVisitedAt,
    "2026-07-01T04:11:00.000Z",
  )
})

test("applyWorkspaceFavoriteToNav patches workspace favorite state", () => {
  const next = applyWorkspaceFavoriteToNav(
    [createWorkspace("page-1"), createWorkspace("page-2")],
    {
      ...createWorkspace("page-2"),
      isFavorite: true,
      name: "Updated",
    },
  )

  assert.equal(next?.[0]?.isFavorite, undefined)
  assert.equal(next?.[1]?.isFavorite, true)
  assert.equal(next?.[1]?.name, "Updated")
})

test("applyDatabaseFavoriteToNav patches database favorite state", () => {
  const next = applyDatabaseFavoriteToNav(
    [
      createWorkspace("page-1", [
        {
          createdAt,
          id: "database-1",
          isFavorite: false,
          name: "Tasks",
          organizationId: "org-1",
          pageId: "page-1",
          updatedAt: createdAt,
          views: [],
        },
      ]),
    ],
    {
      createdAt,
      id: "database-1",
      isFavorite: true,
      name: "Tasks",
      organizationId: "org-1",
      pageId: "page-1",
      updatedAt: createdAt,
      views: [],
    },
  )

  assert.equal(next?.[0]?.databases?.[0]?.isFavorite, true)
})
