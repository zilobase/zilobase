import assert from "node:assert/strict"
import test from "node:test"

import {
  createMailViewFromTemplate,
  mailCustomPropertyTypes,
  mailQuickFilterCatalog,
  mailSystemPropertyCatalog,
  mailViewTemplates,
  maxMailFilterConditions,
  normalizeMailFilterExpression,
  normalizeMailViewConfig,
} from "./organization"

test("mail organization exposes the supported custom property contract", () => {
  assert.deepEqual(mailCustomPropertyTypes, [
    "text",
    "number",
    "select",
    "multi_select",
    "status",
    "date",
    "person",
    "checkbox",
    "url",
    "files",
  ])
})

test("system and quick filter catalogs include the full mailbox fields", () => {
  const systemIds = new Set(mailSystemPropertyCatalog.map(({ id }) => id))
  for (const id of [
    "from",
    "to",
    "cc",
    "bcc",
    "subject",
    "date",
    "received_date",
    "attachments",
    "calendar_event",
    "unread",
    "labels",
    "categories",
    "priority",
  ]) {
    assert.equal(systemIds.has(id), true, `missing system property ${id}`)
  }

  const quickIds = new Set(mailQuickFilterCatalog.map(({ id }) => id))
  for (const category of [
    "primary",
    "social",
    "promotions",
    "updates",
    "forums",
  ]) {
    assert.equal(quickIds.has(`show_${category}`), true)
    assert.equal(quickIds.has(`hide_${category}`), true)
  }
  for (const id of [
    "has_attachments",
    "no_attachments",
    "calendar_only",
    "hide_calendar",
    "is_read",
    "is_unread",
    "show_sent",
    "hide_archived",
  ]) {
    assert.equal(quickIds.has(id), true, `missing quick filter ${id}`)
  }
})

test("view templates are deterministic and protect only Inbox", () => {
  const first = createMailViewFromTemplate("unread")
  const second = createMailViewFromTemplate("unread")

  assert.deepEqual(first, second)
  assert.deepEqual(
    mailViewTemplates
      .filter((template) => template.protected)
      .map(({ id }) => id),
    ["inbox"],
  )
  assert.deepEqual(first.config.filter.filters[0], {
    id: "unread",
    operator: "is",
    propertyId: "unread",
    type: "condition",
    values: [true],
  })
})

test("filter normalization enforces depth and condition limits", () => {
  const condition = (id: number) => ({
    id: `condition-${id}`,
    operator: "is",
    propertyId: "unread",
    type: "condition",
    values: [true],
  })
  const input = {
    id: "root",
    operator: "and",
    type: "group",
    filters: [
      ...Array.from({ length: maxMailFilterConditions + 10 }, (_, index) =>
        condition(index),
      ),
      {
        id: "level-2",
        operator: "or",
        type: "group",
        filters: [
          {
            id: "level-3",
            operator: "and",
            type: "group",
            filters: [
              {
                id: "level-4",
                operator: "and",
                type: "group",
                filters: [condition(100)],
              },
            ],
          },
        ],
      },
    ],
  }

  const normalized = normalizeMailFilterExpression(input)
  assert.equal(normalized.filters.length, maxMailFilterConditions + 1)
  const level2 = normalized.filters.at(-1)
  assert.equal(level2?.type, "group")
  if (level2?.type !== "group") return
  const level3 = level2.filters[0]
  assert.equal(level3?.type, "group")
  if (level3?.type !== "group") return
  assert.deepEqual(level3.filters, [])
})

test("view config normalization rejects malformed values and applies safe defaults", () => {
  const normalized = normalizeMailViewConfig({
    databaseSync: {
      enabled: true,
      mappings: [
        { sourcePropertyId: "subject", destinationPropertyId: "title" },
        { sourcePropertyId: 42, destinationPropertyId: "invalid" },
      ],
    },
    filter: { type: "condition" },
    group: {
      propertyId: "priority",
      direction: "ascending",
      hideEmptyGroups: true,
    },
    hiddenPropertyIds: ["body", 42],
    hoverActions: [
      { id: "reply", kind: "reply", hidden: false },
      { kind: "unknown" },
    ],
    propertyOrder: ["from", null, "subject"],
  })

  assert.equal(normalized.filter.type, "group")
  assert.deepEqual(normalized.filter.filters, [])
  assert.deepEqual(normalized.group, {
    direction: "ascending",
    hideEmptyGroups: true,
    propertyId: "priority",
  })
  assert.deepEqual(normalized.hiddenPropertyIds, ["body"])
  assert.deepEqual(normalized.propertyOrder, ["from", "subject"])
  assert.deepEqual(normalized.hoverActions, [
    {
      effect: undefined,
      hidden: false,
      icon: undefined,
      id: "reply",
      kind: "reply",
      labelId: undefined,
    },
  ])
  assert.deepEqual(normalized.databaseSync.mappings, [
    { sourcePropertyId: "subject", destinationPropertyId: "title" },
  ])
})
