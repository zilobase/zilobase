import assert from "node:assert/strict"
import test from "node:test"

import type { MailFilterExpression } from "./organization"
import { evaluateMailFilterCondition, evaluateMailFilterExpression, type MailFilterRecord } from "./predicate"

const record: MailFilterRecord = {
  attachmentCount: 2,
  bcc: [],
  cc: [],
  customValues: { empty: null, score: 9 },
  from: [{ address: "ada@example.com", name: "Ada" }],
  hasCalendarEvent: false,
  important: true,
  internalDate: new Date(2026, 8, 1, 9).getTime(),
  labelIds: ["INBOX", "UNREAD", "CATEGORY_UPDATES"],
  starred: false,
  subject: "Workspace roadmap",
  to: [{ address: "team@zilobase.com", name: "Team" }],
  unread: true,
}

test("mail predicates evaluate nested AND/OR address and metadata conditions", () => {
  const filter: MailFilterExpression = {
    filters: [
      { id: "subject", operator: "contains", propertyId: "subject", type: "condition", values: ["roadmap"] },
      {
        filters: [
          { id: "sender", operator: "is", propertyId: "from", type: "condition", values: ["ada@example.com"] },
          { id: "starred", operator: "is", propertyId: "starred", type: "condition", values: [true] },
        ],
        id: "people",
        operator: "or",
        type: "group",
      },
    ],
    id: "root",
    operator: "and",
    type: "group",
  }
  assert.equal(evaluateMailFilterExpression(record, filter), true)
})

test("mail predicates implement relative dates, empty custom values, categories, and mailbox semantics", () => {
  const filter: MailFilterExpression = {
    filters: [
      { id: "date", operator: "is_relative_to_today", propertyId: "received_date", type: "condition", values: ["past_week"] },
      { id: "empty", operator: "is_empty", propertyId: "empty", type: "condition", values: [] },
      { id: "category", operator: "is", propertyId: "categories", type: "condition", values: ["updates"] },
      { id: "mailbox", operator: "is", propertyId: "mailbox", type: "condition", values: ["inbox"] },
      { id: "score", operator: "greater_than", propertyId: "score", type: "condition", values: [5] },
    ],
    id: "root",
    operator: "and",
    type: "group",
  }
  assert.equal(
    evaluateMailFilterExpression(record, filter, new Date(2026, 8, 2, 12)),
    true,
  )
})

test("mail predicates accept the shared database relative-date editor format", () => {
  const now = new Date("2026-09-01T12:00:00Z")
  assert.equal(evaluateMailFilterCondition(
    { internalDate: new Date("2026-08-28T12:00:00Z").getTime(), labelIds: [] },
    { id: "relative", operator: "is_relative_to_today", propertyId: "date", type: "condition", values: ["relative:past:week"] },
    now,
  ), true)
})
