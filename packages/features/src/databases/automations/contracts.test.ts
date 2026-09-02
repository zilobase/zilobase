import assert from "node:assert/strict"
import test from "node:test"

import {
  DATABASE_AUTOMATION_LIMITS,
  createDatabaseAutomationRequestSchema,
  databaseAutomationCatalogSchema,
  databaseAutomationDefinitionSchema,
  databaseAutomationDefinitionV1Schema,
  databaseAutomationDeliverySchema,
  databaseAutomationMutationFactSchema,
  databaseAutomationRevisionSchema,
  databaseAutomationRunSchema,
  databaseAutomationSummarySchema,
} from "./contracts"

const literal = (value: string) => ({ type: "literal" as const, value })

const eventDefinition = {
  actions: [
    {
      id: "action-1",
      operations: [
        { mode: "set", propertyId: "status-property", value: literal("done") },
      ],
      type: "edit_trigger_page",
    },
  ],
  definitionVersion: 1,
  scope: { type: "data_source" },
  timezone: "Asia/Kolkata",
  trigger: {
    clauses: [
      { id: "clause-1", type: "page_added" },
      {
        id: "clause-2",
        operand: { entityType: "option", id: "status-done", type: "entity" },
        operator: "is",
        propertyId: "status-property",
        type: "property_edited",
      },
    ],
    kind: "event",
    match: "any",
  },
} as const

test("parses a versioned event automation without changing stable IDs", () => {
  const parsed = databaseAutomationDefinitionSchema.parse(eventDefinition)

  assert.equal(parsed.definitionVersion, 1)
  assert.equal(parsed.trigger.kind, "event")
  assert.equal(parsed.actions[0]?.id, "action-1")
  assert.deepEqual(parsed.scope, { type: "data_source" })
})

test("parses a structurally valid recurring automation", () => {
  const parsed = databaseAutomationDefinitionV1Schema.parse({
    actions: [
      {
        dataSourceId: "target-source",
        id: "add-page",
        operations: [{ mode: "set", propertyId: "name", value: literal("Daily review") }],
        type: "add_page",
      },
    ],
    definitionVersion: 1,
    scope: { type: "data_source" },
    timezone: "America/New_York",
    trigger: {
      kind: "schedule",
      schedule: {
        frequency: "weekly",
        interval: 1,
        localTime: "09:30",
        startDate: "2026-09-07",
        timezone: "America/New_York",
        weekdays: [1, 3, 5],
      },
    },
  })

  assert.equal(parsed.trigger.kind, "schedule")
})

test("publishes the materialized next schedule occurrence", () => {
  const parsed = databaseAutomationSummarySchema.parse({
    actionCount: 1,
    currentRevisionId: "revision-1",
    dataSourceId: "source-1",
    id: "automation-1",
    lastRunAt: null,
    lastRunStatus: null,
    name: "Daily review",
    nextRunAt: "2026-09-03T03:30:00.000Z",
    scopeSummary: "Entire data source",
    status: "active",
    triggerSummary: "daily schedule",
    updatedAt: "2026-09-02T00:00:00.000Z",
    version: 1,
    workspaceId: "workspace-1",
  })
  assert.equal(parsed.nextRunAt, "2026-09-03T03:30:00.000Z")
})

test("rejects invalid schedules and trigger-page behavior", () => {
  const result = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    trigger: {
      kind: "schedule",
      schedule: {
        endDate: "2026-09-01",
        frequency: "weekly",
        interval: 1,
        localTime: "09:30",
        startDate: "2026-09-07",
        timezone: "UTC",
      },
    },
  })

  assert.equal(result.success, false)
  if (!result.success) {
    assert.match(
      result.error.issues.map((issue) => issue.message).join(" "),
      /End date|weekday|trigger page/i,
    )
  }
})

test("rejects scheduled trigger references inside action values", () => {
  const result = databaseAutomationDefinitionV1Schema.safeParse({
    actions: [
      {
        dataSourceId: "target-source",
        id: "add-page",
        operations: [
          {
            mode: "set",
            propertyId: "name",
            value: { reference: "trigger_property", propertyId: "name", type: "reference" },
          },
        ],
        type: "add_page",
      },
    ],
    definitionVersion: 1,
    scope: { type: "data_source" },
    timezone: "UTC",
    trigger: {
      kind: "schedule",
      schedule: {
        frequency: "daily",
        interval: 1,
        localTime: "00:00",
        startDate: "2026-09-07",
        timezone: "UTC",
      },
    },
  })

  assert.equal(result.success, false)
  if (!result.success) {
    assert.match(result.error.issues[0]?.message ?? "", /cannot use trigger/i)
  }
})

test("rejects scheduled notification recipients that require a trigger page", () => {
  const result = databaseAutomationDefinitionV1Schema.safeParse({
    actions: [{
      id: "notify",
      message: { parts: [{ text: "Review", type: "text" }] },
      recipients: [{ type: "trigger_person" }],
      type: "send_notification",
    }],
    definitionVersion: 1,
    scope: { type: "data_source" },
    timezone: "UTC",
    trigger: {
      kind: "schedule",
      schedule: { frequency: "daily", interval: 1, localTime: "09:00", startDate: "2026-09-02", timezone: "UTC" },
    },
  })
  assert.equal(result.success, false)
})

test("enforces unique action, clause, and variable identifiers", () => {
  const duplicateActions = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    actions: [eventDefinition.actions[0], eventDefinition.actions[0]],
  })
  assert.equal(duplicateActions.success, false)

  const duplicateClauses = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    trigger: {
      clauses: [eventDefinition.trigger.clauses[0], eventDefinition.trigger.clauses[0]],
      kind: "event",
      match: "all",
    },
  })
  assert.equal(duplicateClauses.success, false)

  const duplicateVariables = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    actions: [
      {
        id: "variables-1",
        type: "define_variables",
        variables: [{ expression: literal("first"), name: "result" }],
      },
      {
        id: "variables-2",
        type: "define_variables",
        variables: [{ expression: literal("second"), name: "result" }],
      },
    ],
  })
  assert.equal(duplicateVariables.success, false)
})

test("enforces action and webhook limits", () => {
  const webhook = (index: number) => ({
    headers: [],
    id: `webhook-${index}`,
    payloadFields: [],
    selectedPropertyIds: [],
    type: "send_webhook" as const,
    url: `https://example.com/hooks/${index}`,
  })
  const tooManyWebhooks = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    actions: Array.from(
      { length: DATABASE_AUTOMATION_LIMITS.webhookActions + 1 },
      (_, index) => webhook(index),
    ),
  })
  assert.equal(tooManyWebhooks.success, false)

  const tooManyActions = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    actions: Array.from(
      { length: DATABASE_AUTOMATION_LIMITS.actions + 1 },
      (_, index) => ({ ...webhook(index), type: "send_webhook" as const }),
    ),
  })
  assert.equal(tooManyActions.success, false)
})

test("rejects plaintext webhook header values", () => {
  const result = databaseAutomationDefinitionV1Schema.safeParse({
    ...eventDefinition,
    actions: [
      {
        headers: [{ name: "Authorization", secretId: "secret-1", value: "Bearer leaked" }],
        id: "webhook-1",
        payloadFields: [],
        selectedPropertyIds: [],
        type: "send_webhook",
        url: "https://example.com/hook",
      },
    ],
  })

  assert.equal(result.success, false)
})

test("validates management, catalog, run, and delivery wire contracts", () => {
  assert.equal(
    createDatabaseAutomationRequestSchema.parse({
      dataSourceId: "source-1",
      definition: eventDefinition,
      idempotencyKey: "request-1",
      name: "Finish new tasks",
    }).name,
    "Finish new tasks",
  )

  assert.equal(
    databaseAutomationCatalogSchema.parse({
      actions: [{ available: true, reason: null, type: "edit_trigger_page" }],
      canManage: true,
      dataSourceId: "source-1",
      gmailConnections: [{ email: "ada@example.com", id: "gmail-1", status: "connected" }],
      manageUnavailableReason: null,
      properties: [
        {
          id: "status-property",
          name: "Status",
          operators: ["was_edited", "is"],
          type: "status",
          writable: true,
        },
      ],
      users: [{ id: "user-1", name: "Ada" }],
      views: [{ id: "view-1", name: "Open tasks", type: "table" }],
    }).canManage,
    true,
  )

  assert.equal(
    databaseAutomationMutationFactSchema.parse({
      actorId: "user-1",
      changedValues: [{ after: "done", before: "todo", propertyId: "status-property" }],
      dataSourceId: "source-1",
      origin: "user",
      pageId: "page-1",
      rowId: "row-1",
    }).origin,
    "user",
  )

  assert.equal(
    databaseAutomationRevisionSchema.parse({
      automationId: "automation-1",
      createdAt: "2026-09-02T00:00:00.000Z",
      createdById: "user-1",
      definition: eventDefinition,
      definitionHash: "sha256-definition-1",
      definitionVersion: 1,
      id: "revision-1",
      version: 1,
    }).version,
    1,
  )

  assert.equal(
    databaseAutomationRunSchema.parse({
      automationId: "automation-1",
      durationMs: null,
      errorCode: null,
      errorSummary: null,
      finishedAt: null,
      id: "run-1",
      revisionId: "revision-1",
      scheduledFor: null,
      skipReason: null,
      startedAt: null,
      status: "queued",
      triggerActorId: "user-1",
      triggerPageId: "page-1",
      triggerRowId: "row-1",
      triggerTime: "2026-09-02T00:00:00.000Z",
    }).status,
    "queued",
  )

  assert.equal(
    databaseAutomationDeliverySchema.parse({
      actionId: "webhook-1",
      attempts: 0,
      deliveryId: "delivery-1",
      destinationHash: "hash-1",
      errorCode: null,
      errorSummary: null,
      kind: "webhook",
      nextAttemptAt: null,
      providerReference: null,
      responseStatus: null,
      runId: "run-1",
      status: "pending",
    }).kind,
    "webhook",
  )
})

test("automation catalogs expose only opaque Gmail connection metadata", () => {
  const result = databaseAutomationCatalogSchema.safeParse({
    actions: [{ available: true, reason: null, type: "send_gmail" }],
    canManage: true,
    dataSourceId: "source-1",
    gmailConnections: [{
      email: "ada@example.com",
      id: "gmail-1",
      refreshTokenCiphertext: "must-not-leak",
      status: "connected",
    }],
    manageUnavailableReason: null,
    properties: [],
    users: [],
    views: [],
  })
  assert.equal(result.success, false)
})
