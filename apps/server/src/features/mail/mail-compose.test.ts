import assert from "node:assert/strict"
import { beforeEach, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteCalls: 0,
  operations: [] as Array<Record<string, unknown>>,
}))

vi.mock("../../infrastructure/database", () => ({
  db: {
    delete() {
      return { where: async () => { mocks.deleteCalls += 1 } }
    },
    insert() {
      return {
        values(value: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              let inserted = false
              if (!mocks.operations.some((operation) => operation.id === value.id)) {
                mocks.operations.push({ createdAt: new Date(), updatedAt: new Date(), ...value })
                inserted = true
              }
              return { async returning() { return inserted ? [{ id: value.id }] : [] } }
            },
          }
        },
      }
    },
    select() {
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: async () => mocks.operations,
      }
      return builder
    },
    update() {
      let update: Record<string, unknown> = {}
      const apply = () => { if (mocks.operations[0]) Object.assign(mocks.operations[0], update) }
      return {
        set(value: Record<string, unknown>) {
          update = value
          return {
            where() {
              apply()
              return { then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(undefined)), async returning() { return [{ id: mocks.operations[0]?.id }] } }
            },
          }
        },
      }
    },
  },
}))

import { cleanupExpiredGmailSendOperations, sendGmailComposition } from "./mail-compose"
import { GmailApiError, type GmailConnectionRow, type GmailGateway } from "./gmail-gateway"

const connection = {
  email: "sender@example.com",
  id: "connection-1",
  userId: "user-1",
} as GmailConnectionRow
const compose = {
  attachments: [],
  bcc: [],
  bodyText: "Hello",
  cc: [],
  clientOperationId: "operation_123456",
  subject: "Hello",
  to: [{ address: "person@example.com", name: null }],
}

beforeEach(() => {
  mocks.deleteCalls = 0
  mocks.operations = []
})

test("successful sends are deduplicated by stable client operation and RFC message IDs", async () => {
  let sends = 0
  const gateway = fakeGateway({
    async listMessages() { return { messages: [] } },
    async sendMessage() { sends += 1; return { id: "sent-1" } },
  })

  const first = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" })
  const second = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" })

  assert.equal(first.reused, false)
  assert.equal(second.reused, true)
  assert.equal(sends, 1)
  assert.equal(mocks.operations[0]?.status, "sent")
  assert.equal(mocks.operations[0]?.rfcMessageId, "<zilobase.operation_123456@example.com>")
})

test("ambiguous provider failures search Sent mail before allowing any retry", async () => {
  let searches = 0
  const gateway = fakeGateway({
    async listMessages() {
      searches += 1
      return { messages: searches === 1 ? [] : [{ id: "recovered-1" }] }
    },
    async sendMessage() { throw new GmailApiError("timeout", 504, "provider_error", true) },
  })

  const result = await sendGmailComposition({ compose, connection, gateway, userId: "user-1" })
  assert.equal(result.reused, true)
  assert.equal(mocks.operations[0]?.gmailMessageId, "recovered-1")
  assert.equal(searches, 2)
})

test("expired send receipts have a metadata-only cleanup path", async () => {
  await cleanupExpiredGmailSendOperations(new Date("2026-08-30T00:00:00Z"))
  assert.equal(mocks.deleteCalls, 1)
})

function fakeGateway(overrides: Partial<GmailGateway>) {
  return {
    async getMessage(id: string) {
      return {
        historyId: "2",
        id,
        internalDate: "1788084000000",
        labelIds: ["SENT"],
        payload: { headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "person@example.com" },
          { name: "Subject", value: "Hello" },
          { name: "Message-ID", value: "<zilobase.operation_123456@example.com>" },
        ] },
        snippet: "Hello",
        threadId: "thread-1",
      }
    },
    ...overrides,
  } as GmailGateway
}
