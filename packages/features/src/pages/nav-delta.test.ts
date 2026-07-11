import assert from "node:assert/strict"
import test from "node:test"

import {
  applyDatabaseFavoriteToNav,
  applyItemVisitToNav,
  applyPageFavoriteToNav,
} from "./nav-delta"
import type { Page, PageDatabase, PageNavigationPayload } from "./queries"

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

function createNavigation(
  pages: Page[],
  databases: PageDatabase[] = [],
): PageNavigationPayload {
  return { databases, pages, placements: [] }
}

test("applyItemVisitToNav patches page visits without replacing other items", () => {
  const next = applyItemVisitToNav(
    createNavigation([createPage("page-1"), createPage("page-2")]),
    {
      itemId: "page-2",
      itemKind: "page",
      lastVisitedAt: "2026-07-01T04:10:00.000Z",
    },
  )

  assert.equal(next?.pages[0]?.lastVisitedAt, undefined)
  assert.equal(next?.pages[1]?.lastVisitedAt, "2026-07-01T04:10:00.000Z")
})

test("applyItemVisitToNav patches database visits inside page nav", () => {
  const next = applyItemVisitToNav(
    createNavigation(
      [createPage("page-1")],
      [
        {
          createdAt,
          id: "database-1",
          name: "Tasks",
          workspaceId: "org-1",
          pageId: "page-1",
          updatedAt: createdAt,
          views: [],
        },
      ],
    ),
    {
      itemId: "database-1",
      itemKind: "database",
      lastVisitedAt: "2026-07-01T04:11:00.000Z",
    },
  )

  assert.equal(
    next?.databases[0]?.lastVisitedAt,
    "2026-07-01T04:11:00.000Z",
  )
})

test("applyPageFavoriteToNav patches page favorite state", () => {
  const next = applyPageFavoriteToNav(
    createNavigation([createPage("page-1"), createPage("page-2")]),
    {
      ...createPage("page-2"),
      isFavorite: true,
      name: "Updated",
    },
  )

  assert.equal(next?.pages[0]?.isFavorite, undefined)
  assert.equal(next?.pages[1]?.isFavorite, true)
  assert.equal(next?.pages[1]?.name, "Updated")
})

test("applyDatabaseFavoriteToNav patches database favorite state", () => {
  const next = applyDatabaseFavoriteToNav(
    createNavigation(
      [createPage("page-1")],
      [
        {
          createdAt,
          id: "database-1",
          isFavorite: false,
          name: "Tasks",
          workspaceId: "org-1",
          pageId: "page-1",
          updatedAt: createdAt,
          views: [],
        },
      ],
    ),
    {
      createdAt,
      id: "database-1",
      isFavorite: true,
      name: "Tasks",
      workspaceId: "org-1",
      pageId: "page-1",
      updatedAt: createdAt,
      views: [],
    },
  )

  assert.equal(next?.databases[0]?.isFavorite, true)
})
