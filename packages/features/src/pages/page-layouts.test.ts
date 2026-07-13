import assert from "node:assert/strict"
import test from "node:test"

import {
  createDefaultPageLayout,
  movePageLayoutModule,
  normalizePageLayoutConfig,
  toWorkspacePageLayout,
} from "./page-layouts"

test("database defaults include one property group", () => {
  const layout = createDefaultPageLayout({ database: true })

  assert.equal(
    layout.modules.filter((module) => module.type === "property_group").length,
    1,
  )
})

test("normalization restores required modules and removes duplicate ids", () => {
  const layout = normalizePageLayoutConfig(
    {
      version: 1,
      modules: [
        { id: "content", type: "content", region: "panel" },
        { id: "content", type: "heading", region: "main" },
      ],
    },
    { database: true },
  )

  assert.equal(layout.modules.filter((module) => module.id === "content").length, 1)
  assert.ok(layout.modules.some((module) => module.type === "heading"))
  assert.ok(layout.modules.some((module) => module.type === "property_group"))
})

test("workspace layouts strip schema-bound modules and linked tabs", () => {
  const layout = createDefaultPageLayout({ database: true })
  layout.modules.push({
    id: "property-status",
    propertyId: "status",
    region: "main",
    type: "property",
  })
  layout.linkedTabs.push({
    id: "linked-projects-table",
    databaseId: "projects",
    databaseName: "Projects",
    viewId: "table",
    viewName: "Table",
    viewType: "table",
  })
  layout.pinnedPropertyIds = ["status"]
  layout.propertySettings.status = { display: "hidden" }

  const workspaceLayout = toWorkspacePageLayout(layout)

  assert.deepEqual(workspaceLayout.linkedTabs, [])
  assert.deepEqual(workspaceLayout.pinnedPropertyIds, [])
  assert.deepEqual(workspaceLayout.propertyOrder, [])
  assert.deepEqual(workspaceLayout.propertySettings, {})
  assert.equal(
    workspaceLayout.modules.some(
      (module) => module.type === "property" || module.type === "property_group",
    ),
    false,
  )
})

test("module moves preserve the other modules and update the destination region", () => {
  const layout = createDefaultPageLayout({ database: true })
  layout.modules.push({
    id: "property-status",
    propertyId: "status",
    region: "main",
    type: "property",
  })
  const moved = movePageLayoutModule(layout, "property-status", {
    region: "panel",
  })

  assert.deepEqual(
    moved.modules.map((module) => module.id).sort(),
    layout.modules.map((module) => module.id).sort(),
  )
  assert.equal(
    moved.modules.find((module) => module.id === "property-status")?.region,
    "panel",
  )
})

test("dropping at the end appends after the last module in that region", () => {
  const layout = createDefaultPageLayout({ database: true })
  const moved = movePageLayoutModule(layout, "property-group", {
    region: "panel",
  })

  assert.deepEqual(
    moved.modules.filter((module) => module.region === "panel").map((module) => module.id),
    ["property-group"],
  )
  assert.equal(moved.modules.at(-1)?.id, "property-group")
})

test("a no-op module move retains the original layout reference", () => {
  const layout = createDefaultPageLayout({ database: true })
  const moved = movePageLayoutModule(layout, "heading", {
    beforeModuleId: "property-group",
    region: "main",
  })

  assert.equal(moved, layout)
})

test("the heading module cannot be moved", () => {
  const layout = createDefaultPageLayout({ database: true })
  const moved = movePageLayoutModule(layout, "heading", { region: "panel" })

  assert.equal(moved, layout)
})

test("normalization fixes the heading at the start of the main region", () => {
  const layout = normalizePageLayoutConfig({
    modules: [
      { id: "content", region: "main", type: "content" },
      { id: "heading", region: "panel", type: "heading" },
      { id: "second-heading", region: "main", type: "heading" },
    ],
  })

  assert.equal(layout.modules[0]?.id, "heading")
  assert.equal(layout.modules[0]?.region, "main")
  assert.equal(
    layout.modules.filter((module) => module.type === "heading").length,
    1,
  )
})

test("a main property group stays directly below the heading", () => {
  const layout = createDefaultPageLayout({ database: true })
  const moved = movePageLayoutModule(layout, "content", {
    beforeModuleId: "property-group",
    region: "main",
  })

  assert.deepEqual(
    moved.modules.slice(0, 2).map((module) => module.type),
    ["heading", "property_group"],
  )
})

test("a property group can move to the panel and returns below the heading", () => {
  const layout = createDefaultPageLayout({ database: true })
  const inPanel = movePageLayoutModule(layout, "property-group", {
    region: "panel",
  })
  const inMain = movePageLayoutModule(inPanel, "property-group", {
    region: "main",
  })

  assert.equal(
    inPanel.modules.find((module) => module.type === "property_group")?.region,
    "panel",
  )
  assert.deepEqual(
    inMain.modules.slice(0, 2).map((module) => module.type),
    ["heading", "property_group"],
  )
})

test("content and discussions cannot move to the panel", () => {
  const layout = createDefaultPageLayout({ database: true })

  assert.equal(
    movePageLayoutModule(layout, "content", { region: "panel" }),
    layout,
  )
  assert.equal(
    movePageLayoutModule(layout, "discussions", { region: "panel" }),
    layout,
  )
})

test("normalization restores main-only modules to the main region", () => {
  const layout = normalizePageLayoutConfig({
    modules: [
      { id: "heading", region: "main", type: "heading" },
      { id: "discussions", region: "panel", type: "discussions" },
      { id: "content", region: "panel", type: "content" },
    ],
  })

  assert.equal(
    layout.modules.find((module) => module.type === "content")?.region,
    "main",
  )
  assert.equal(
    layout.modules.find((module) => module.type === "discussions")?.region,
    "main",
  )
})
