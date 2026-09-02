import { z } from "zod"

export const DATABASE_AUTOMATION_DEFINITION_VERSION = 1 as const

export const DATABASE_AUTOMATION_LIMITS = {
  actions: 50,
  activePerDataSource: 100,
  editPagesRows: 1_000,
  notificationRecipients: 20,
  triggerClauses: 20,
  variablesPerAction: 25,
  webhookActions: 5,
} as const

const stableIdSchema = z.string().trim().min(1).max(200)
const shortTextSchema = z.string().trim().min(1).max(200)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const timestampSchema = z.string().datetime({ offset: true })

export type AutomationJsonValue =
  | null
  | boolean
  | number
  | string
  | AutomationJsonValue[]
  | { [key: string]: AutomationJsonValue }

export const automationJsonValueSchema: z.ZodType<AutomationJsonValue> = z.lazy(
  () =>
    z.union([
      z.null(),
      z.boolean(),
      z.number().finite(),
      z.string(),
      z.array(automationJsonValueSchema),
      z.record(z.string(), automationJsonValueSchema),
    ]),
)

export const databaseAutomationStatuses = [
  "active",
  "paused",
  "error",
  "deleted",
] as const
export const databaseAutomationStatusSchema = z.enum(databaseAutomationStatuses)
export type DatabaseAutomationStatus = z.infer<
  typeof databaseAutomationStatusSchema
>

export const databaseAutomationRunStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
] as const
export const databaseAutomationRunStatusSchema = z.enum(
  databaseAutomationRunStatuses,
)
export type DatabaseAutomationRunStatus = z.infer<
  typeof databaseAutomationRunStatusSchema
>

export const databaseAutomationStepStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const
export const databaseAutomationStepStatusSchema = z.enum(
  databaseAutomationStepStatuses,
)
export type DatabaseAutomationStepStatus = z.infer<
  typeof databaseAutomationStepStatusSchema
>

export const databaseAutomationDeliveryStatuses = [
  "pending",
  "sending",
  "retrying",
  "succeeded",
  "failed",
] as const
export const databaseAutomationDeliveryStatusSchema = z.enum(
  databaseAutomationDeliveryStatuses,
)
export type DatabaseAutomationDeliveryStatus = z.infer<
  typeof databaseAutomationDeliveryStatusSchema
>

export const databaseMutationOrigins = [
  "user",
  "button",
  "form",
  "api",
  "import",
  "integration",
  "ai",
  "automation",
  "system",
] as const
export const databaseMutationOriginSchema = z.enum(databaseMutationOrigins)
export type DatabaseMutationOrigin = z.infer<typeof databaseMutationOriginSchema>

export const databaseAutomationMutationFactSchema = z
  .object({
    actorId: stableIdSchema.nullable().optional(),
    automationRunId: stableIdSchema.optional(),
    changedValues: z.array(
      z
        .object({
          after: automationJsonValueSchema,
          before: automationJsonValueSchema,
          propertyId: stableIdSchema,
        })
        .strict(),
    ),
    dataSourceId: stableIdSchema,
    origin: databaseMutationOriginSchema,
    pageId: stableIdSchema,
    rowAdded: z.boolean().optional(),
    rowId: stableIdSchema,
  })
  .strict()
export type DatabaseAutomationMutationFact = z.infer<
  typeof databaseAutomationMutationFactSchema
>

export const databaseAutomationTriggerOperators = [
  "was_edited",
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "is_empty",
  "is_not_empty",
  "is_before",
  "is_after",
  "is_on_or_before",
  "is_on_or_after",
  "is_between",
  "is_relative_to_today",
  "is_checked",
  "is_unchecked",
] as const
export const databaseAutomationTriggerOperatorSchema = z.enum(
  databaseAutomationTriggerOperators,
)
export type DatabaseAutomationTriggerOperator = z.infer<
  typeof databaseAutomationTriggerOperatorSchema
>

export const automationEntityReferenceSchema = z
  .object({
    entityType: z.enum(["option", "page", "user"]),
    id: stableIdSchema,
    type: z.literal("entity"),
  })
  .strict()

export const automationDateOperandSchema = z
  .object({
    precision: z.enum(["date", "minute", "second"]).optional(),
    type: z.literal("date"),
    value: z.string().datetime({ offset: true }),
  })
  .strict()

export const automationDateRangeOperandSchema = z
  .object({
    end: z.string().datetime({ offset: true }),
    start: z.string().datetime({ offset: true }),
    type: z.literal("date_range"),
  })
  .strict()

export const automationRelativeDateOperandSchema = z
  .object({
    amount: z.number().int().min(0).max(10_000),
    direction: z.enum(["past", "next", "this"]),
    type: z.literal("relative_date"),
    unit: z.enum(["day", "week", "month", "year"]),
  })
  .strict()

export const automationTriggerOperandSchema = z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string().max(10_000),
  automationEntityReferenceSchema,
  automationDateOperandSchema,
  automationDateRangeOperandSchema,
  automationRelativeDateOperandSchema,
])
export type AutomationTriggerOperand = z.infer<
  typeof automationTriggerOperandSchema
>

export const databaseAutomationEventTriggerClauseSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        id: stableIdSchema,
        type: z.literal("page_added"),
      })
      .strict(),
    z
      .object({
        id: stableIdSchema,
        operand: automationTriggerOperandSchema.optional(),
        operator: databaseAutomationTriggerOperatorSchema,
        propertyId: stableIdSchema,
        type: z.literal("property_edited"),
      })
      .strict(),
  ],
)
export type DatabaseAutomationEventTriggerClause = z.infer<
  typeof databaseAutomationEventTriggerClauseSchema
>

export const databaseAutomationEventTriggerSchema = z
  .object({
    clauses: z
      .array(databaseAutomationEventTriggerClauseSchema)
      .min(1)
      .max(DATABASE_AUTOMATION_LIMITS.triggerClauses),
    kind: z.literal("event"),
    match: z.enum(["any", "all"]),
  })
  .strict()

export const databaseAutomationScheduleSchema = z
  .object({
    dayOfMonth: z.union([z.number().int().min(1).max(31), z.literal("last")]).optional(),
    endDate: dateSchema.optional(),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
    interval: z.number().int().min(1).max(365),
    localTime: localTimeSchema,
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
    startDate: dateSchema,
    timezone: shortTextSchema,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  })
  .strict()
  .superRefine((schedule, context) => {
    if (schedule.endDate && schedule.endDate < schedule.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must not be before start date",
        path: ["endDate"],
      })
    }
    if (schedule.frequency === "weekly" && !schedule.weekdays) {
      context.addIssue({
        code: "custom",
        message: "Weekly schedules require at least one weekday",
        path: ["weekdays"],
      })
    }
    if (schedule.frequency === "monthly" && schedule.dayOfMonth === undefined) {
      context.addIssue({
        code: "custom",
        message: "Monthly schedules require a day of month",
        path: ["dayOfMonth"],
      })
    }
    if (schedule.frequency === "yearly") {
      if (schedule.dayOfMonth === undefined) {
        context.addIssue({
          code: "custom",
          message: "Yearly schedules require a day of month",
          path: ["dayOfMonth"],
        })
      }
      if (!schedule.months) {
        context.addIssue({
          code: "custom",
          message: "Yearly schedules require at least one month",
          path: ["months"],
        })
      }
    }
  })
export type DatabaseAutomationSchedule = z.infer<
  typeof databaseAutomationScheduleSchema
>

export const databaseAutomationScheduleTriggerSchema = z
  .object({
    kind: z.literal("schedule"),
    schedule: databaseAutomationScheduleSchema,
  })
  .strict()

export const databaseAutomationTriggerSchema = z.discriminatedUnion("kind", [
  databaseAutomationEventTriggerSchema,
  databaseAutomationScheduleTriggerSchema,
])
export type DatabaseAutomationTrigger = z.infer<
  typeof databaseAutomationTriggerSchema
>

export const databaseAutomationScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("data_source") }).strict(),
  z
    .object({
      type: z.literal("view"),
      viewId: stableIdSchema,
    })
    .strict(),
])
export type DatabaseAutomationScope = z.infer<
  typeof databaseAutomationScopeSchema
>

export const automationReferenceSchema = z.discriminatedUnion("reference", [
  z.object({ reference: z.literal("trigger_page"), type: z.literal("reference") }).strict(),
  z
    .object({
      propertyId: stableIdSchema,
      reference: z.literal("trigger_property"),
      type: z.literal("reference"),
    })
    .strict(),
  z.object({ reference: z.literal("trigger_person"), type: z.literal("reference") }).strict(),
  z.object({ reference: z.literal("page_creator"), type: z.literal("reference") }).strict(),
  z.object({ reference: z.literal("page_last_editor"), type: z.literal("reference") }).strict(),
  z.object({ reference: z.literal("now"), type: z.literal("reference") }).strict(),
  z.object({ reference: z.literal("today"), type: z.literal("reference") }).strict(),
  z
    .object({
      name: shortTextSchema,
      reference: z.literal("variable"),
      type: z.literal("reference"),
    })
    .strict(),
  z
    .object({
      actionId: stableIdSchema,
      output: shortTextSchema,
      reference: z.literal("action_output"),
      type: z.literal("reference"),
    })
    .strict(),
  z
    .object({
      reference: z.literal("selected_person"),
      type: z.literal("reference"),
      userId: stableIdSchema,
    })
    .strict(),
  z
    .object({
      pageId: stableIdSchema,
      reference: z.literal("selected_page"),
      type: z.literal("reference"),
    })
    .strict(),
  z
    .object({
      groupId: stableIdSchema,
      reference: z.literal("selected_group"),
      type: z.literal("reference"),
    })
    .strict(),
  z
    .object({
      reference: z.literal("selected_teamspace"),
      teamspaceId: stableIdSchema,
      type: z.literal("reference"),
    })
    .strict(),
])
export type AutomationReference = z.infer<typeof automationReferenceSchema>

export const automationValueExpressionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("literal"),
      value: automationJsonValueSchema,
    })
    .strict(),
  z
    .object({
      expression: z.string().trim().min(1).max(20_000),
      type: z.literal("formula"),
    })
    .strict(),
  automationReferenceSchema,
])
export type AutomationValueExpression = z.infer<
  typeof automationValueExpressionSchema
>

export const automationRichTextExpressionSchema = z
  .object({
    parts: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ text: z.string().max(20_000), type: z.literal("text") }).strict(),
          z.object({ type: z.literal("value"), value: automationValueExpressionSchema }).strict(),
        ]),
      )
      .min(1)
      .max(1_000),
  })
  .strict()
export type AutomationRichTextExpression = z.infer<
  typeof automationRichTextExpressionSchema
>

export const slackAutomationRichTextExpressionSchema = z.object({
  parts: z.array(z.discriminatedUnion("type", [
    z.object({ text: z.string().max(20_000), type: z.literal("text") }).strict(),
    z.object({ type: z.literal("value"), value: automationValueExpressionSchema }).strict(),
    z.object({ id: stableIdSchema, kind: z.enum(["channel", "user"]), type: z.literal("slack_mention") }).strict(),
    z.object({ label: shortTextSchema, type: z.literal("link"), url: z.string().url().max(2_048) }).strict(),
  ])).min(1).max(1_000),
}).strict()
export type SlackAutomationRichTextExpression = z.infer<typeof slackAutomationRichTextExpressionSchema>

export const automationPropertyOperationSchema = z
  .object({
    mode: z.enum(["set", "add", "remove", "clear"]),
    propertyId: stableIdSchema,
    value: automationValueExpressionSchema.optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.mode === "clear" && operation.value !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Clear operations cannot contain a value",
        path: ["value"],
      })
    }
    if (operation.mode !== "clear" && operation.value === undefined) {
      context.addIssue({
        code: "custom",
        message: `${operation.mode} operations require a value`,
        path: ["value"],
      })
    }
  })
export type AutomationPropertyOperation = z.infer<
  typeof automationPropertyOperationSchema
>

export type AutomationFilterDefinition = {
  match: "all" | "any"
  conditions: Array<AutomationFilterCondition | AutomationFilterDefinition>
}

export type AutomationFilterCondition = {
  id: string
  operand?: AutomationTriggerOperand
  operator: DatabaseAutomationTriggerOperator
  propertyId: string
  type: "condition"
}

export const automationFilterConditionSchema: z.ZodType<AutomationFilterCondition> = z
  .object({
    id: stableIdSchema,
    operand: automationTriggerOperandSchema.optional(),
    operator: databaseAutomationTriggerOperatorSchema,
    propertyId: stableIdSchema,
    type: z.literal("condition"),
  })
  .strict()

export const automationFilterDefinitionSchema: z.ZodType<AutomationFilterDefinition> = z.lazy(
  () =>
    z
      .object({
        conditions: z
          .array(z.union([automationFilterConditionSchema, automationFilterDefinitionSchema]))
          .min(1)
          .max(100),
        match: z.enum(["all", "any"]),
      })
      .strict(),
)

export const automationEditPagesTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("variable_pages"),
      variableName: shortTextSchema,
    })
    .strict(),
  z
    .object({
      propertyId: stableIdSchema,
      type: z.literal("related_pages"),
    })
    .strict(),
  z
    .object({
      dataSourceId: stableIdSchema,
      filter: automationFilterDefinitionSchema,
      type: z.literal("filtered_data_source"),
    })
    .strict(),
])
export type AutomationEditPagesTarget = z.infer<
  typeof automationEditPagesTargetSchema
>

export const automationNotificationRecipientSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("trigger_person") }).strict(),
    z.object({ type: z.literal("page_creator") }).strict(),
    z.object({ type: z.literal("selected_user"), userId: stableIdSchema }).strict(),
    z.object({ propertyId: stableIdSchema, type: z.literal("person_property") }).strict(),
    z.object({ type: z.literal("variable"), variableName: shortTextSchema }).strict(),
  ],
)
export type AutomationNotificationRecipient = z.infer<
  typeof automationNotificationRecipientSchema
>

const actionIdShape = { id: stableIdSchema }

export const databaseAutomationActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...actionIdShape,
      type: z.literal("define_variables"),
      variables: z
        .array(
          z
            .object({
              expression: automationValueExpressionSchema,
              name: shortTextSchema,
            })
            .strict(),
        )
        .min(1)
        .max(DATABASE_AUTOMATION_LIMITS.variablesPerAction),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      operations: z.array(automationPropertyOperationSchema).min(1).max(100),
      type: z.literal("edit_trigger_page"),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      dataSourceId: stableIdSchema,
      operations: z.array(automationPropertyOperationSchema).min(1).max(100),
      type: z.literal("add_page"),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      operations: z.array(automationPropertyOperationSchema).min(1).max(100),
      target: automationEditPagesTargetSchema,
      type: z.literal("edit_pages"),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      message: automationRichTextExpressionSchema,
      pageLink: automationValueExpressionSchema.optional(),
      recipients: z
        .array(automationNotificationRecipientSchema)
        .min(1)
        .max(DATABASE_AUTOMATION_LIMITS.notificationRecipients),
      type: z.literal("send_notification"),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      bcc: z.array(automationValueExpressionSchema).max(100),
      cc: z.array(automationValueExpressionSchema).max(100),
      connectionId: stableIdSchema,
      displayName: automationValueExpressionSchema.optional(),
      message: automationRichTextExpressionSchema,
      replyTo: automationValueExpressionSchema.optional(),
      subject: automationRichTextExpressionSchema,
      to: z.array(automationValueExpressionSchema).min(1).max(100),
      type: z.literal("send_gmail"),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      headers: z
        .array(
          z
            .object({
              name: shortTextSchema,
              secretId: stableIdSchema,
            })
            .strict(),
        )
        .max(100),
      payloadFields: z
        .array(
          z
            .object({
              key: shortTextSchema,
              value: automationValueExpressionSchema,
            })
            .strict(),
        )
        .max(100),
      selectedPropertyIds: z.array(stableIdSchema).max(100),
      type: z.literal("send_webhook"),
      url: z.string().url().max(2_048),
    })
    .strict(),
  z
    .object({
      ...actionIdShape,
      channelId: stableIdSchema,
      connectionId: stableIdSchema,
      message: slackAutomationRichTextExpressionSchema,
      type: z.literal("send_slack"),
    })
    .strict(),
])
export type DatabaseAutomationAction = z.infer<
  typeof databaseAutomationActionSchema
>

const scheduledForbiddenReferences = new Set([
  "page_creator",
  "page_last_editor",
  "trigger_page",
  "trigger_person",
  "trigger_property",
])

function visitValues(value: unknown, visitor: (value: unknown) => void) {
  visitor(value)
  if (Array.isArray(value)) {
    for (const item of value) visitValues(item, visitor)
    return
  }
  if (!value || typeof value !== "object") return
  for (const item of Object.values(value)) visitValues(item, visitor)
}

export const databaseAutomationDefinitionV1Schema = z
  .object({
    actions: z
      .array(databaseAutomationActionSchema)
      .min(1)
      .max(DATABASE_AUTOMATION_LIMITS.actions),
    definitionVersion: z.literal(DATABASE_AUTOMATION_DEFINITION_VERSION),
    scope: databaseAutomationScopeSchema,
    timezone: shortTextSchema,
    trigger: databaseAutomationTriggerSchema,
  })
  .strict()
  .superRefine((definition, context) => {
    const actionIds = new Set<string>()
    const variableNames = new Set<string>()
    let webhookCount = 0

    definition.actions.forEach((action, actionIndex) => {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: "custom",
          message: "Action IDs must be unique",
          path: ["actions", actionIndex, "id"],
        })
      }
      actionIds.add(action.id)

      if (action.type === "send_webhook") webhookCount += 1
      if (action.type === "define_variables") {
        action.variables.forEach((variable, variableIndex) => {
          if (variableNames.has(variable.name)) {
            context.addIssue({
              code: "custom",
              message: "Variable names must be unique",
              path: ["actions", actionIndex, "variables", variableIndex, "name"],
            })
          }
          variableNames.add(variable.name)
        })
      }
    })

    if (webhookCount > DATABASE_AUTOMATION_LIMITS.webhookActions) {
      context.addIssue({
        code: "custom",
        message: `Automations support at most ${DATABASE_AUTOMATION_LIMITS.webhookActions} webhook actions`,
        path: ["actions"],
      })
    }

    if (definition.trigger.kind === "event") {
      const clauseIds = new Set<string>()
      definition.trigger.clauses.forEach((clause, clauseIndex) => {
        if (clauseIds.has(clause.id)) {
          context.addIssue({
            code: "custom",
            message: "Trigger clause IDs must be unique",
            path: ["trigger", "clauses", clauseIndex, "id"],
          })
        }
        clauseIds.add(clause.id)
      })
      return
    }

    definition.actions.forEach((action, actionIndex) => {
      if (action.type === "edit_trigger_page") {
        context.addIssue({
          code: "custom",
          message: "Scheduled automations cannot edit a trigger page",
          path: ["actions", actionIndex],
        })
      }
      if (action.type === "send_notification") {
        action.recipients.forEach((recipient) => {
          if (["page_creator", "person_property", "trigger_person"].includes(recipient.type)) {
            context.addIssue({
              code: "custom",
              message: "Scheduled notifications cannot use trigger-page or trigger-person recipients",
              path: ["actions", actionIndex, "recipients"],
            })
          }
        })
      }
      visitValues(action, (value) => {
        if (
          value &&
          typeof value === "object" &&
          "reference" in value &&
          scheduledForbiddenReferences.has(String(value.reference))
        ) {
          context.addIssue({
            code: "custom",
            message: "Scheduled automations cannot use trigger-page or trigger-person references",
            path: ["actions", actionIndex],
          })
        }
      })
    })
  })
export type DatabaseAutomationDefinitionV1 = z.infer<
  typeof databaseAutomationDefinitionV1Schema
>

export const databaseAutomationDefinitionSchema = z.discriminatedUnion(
  "definitionVersion",
  [databaseAutomationDefinitionV1Schema],
)
export type DatabaseAutomationDefinition = z.infer<
  typeof databaseAutomationDefinitionSchema
>

export const databaseAutomationDependencyTypeSchema = z.enum([
  "data_source",
  "database",
  "view",
  "property",
  "user",
  "group",
  "gmail_connection",
  "slack_connection",
  "secret",
])
export type DatabaseAutomationDependencyType = z.infer<
  typeof databaseAutomationDependencyTypeSchema
>

export const databaseAutomationDependencySchema = z
  .object({
    dependencyId: stableIdSchema,
    dependencyType: databaseAutomationDependencyTypeSchema,
    usage: shortTextSchema,
  })
  .strict()
export type DatabaseAutomationDependency = z.infer<
  typeof databaseAutomationDependencySchema
>

export const databaseAutomationValidationErrorSchema = z
  .object({
    code: shortTextSchema,
    message: z.string().trim().min(1).max(2_000),
    path: z.array(z.union([z.string(), z.number().int()])),
  })
  .strict()
export type DatabaseAutomationValidationError = z.infer<
  typeof databaseAutomationValidationErrorSchema
>

export const databaseAutomationValidationResultSchema = z
  .object({
    errors: z.array(databaseAutomationValidationErrorSchema),
    valid: z.boolean(),
    warnings: z.array(databaseAutomationValidationErrorSchema),
  })
  .strict()
export type DatabaseAutomationValidationResult = z.infer<
  typeof databaseAutomationValidationResultSchema
>

export const databaseAutomationSummarySchema = z
  .object({
    actionCount: z.number().int().min(1).max(DATABASE_AUTOMATION_LIMITS.actions),
    currentRevisionId: stableIdSchema,
    dataSourceId: stableIdSchema,
    id: stableIdSchema,
    lastRunAt: timestampSchema.nullable(),
    lastRunStatus: databaseAutomationRunStatusSchema.nullable(),
    name: shortTextSchema,
    nextRunAt: timestampSchema.nullable(),
    scopeSummary: z.string().max(500),
    status: databaseAutomationStatusSchema,
    triggerSummary: z.string().max(500),
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
    workspaceId: stableIdSchema,
  })
  .strict()
export type DatabaseAutomationSummary = z.infer<
  typeof databaseAutomationSummarySchema
>

export const databaseAutomationDetailSchema = databaseAutomationSummarySchema
  .extend({
    createdAt: timestampSchema,
    createdById: stableIdSchema.nullable(),
    definition: databaseAutomationDefinitionSchema,
    errorActionId: stableIdSchema.nullable(),
    errorCode: z.string().max(200).nullable(),
    errorSummary: z.string().max(2_000).nullable(),
    erroredAt: timestampSchema.nullable(),
    ownerUserId: stableIdSchema.nullable(),
  })
  .strict()
export type DatabaseAutomationDetail = z.infer<
  typeof databaseAutomationDetailSchema
>

export const databaseAutomationRevisionSchema = z
  .object({
    automationId: stableIdSchema,
    createdAt: timestampSchema,
    createdById: stableIdSchema.nullable(),
    definition: databaseAutomationDefinitionSchema,
    definitionHash: stableIdSchema,
    definitionVersion: z.literal(DATABASE_AUTOMATION_DEFINITION_VERSION),
    id: stableIdSchema,
    version: z.number().int().positive(),
  })
  .strict()
export type DatabaseAutomationRevision = z.infer<
  typeof databaseAutomationRevisionSchema
>

export const databaseAutomationStepRunSchema = z
  .object({
    actionId: stableIdSchema,
    actionIndex: z.number().int().min(0),
    durationMs: z.number().int().min(0).nullable(),
    errorCode: z.string().max(200).nullable(),
    errorSummary: z.string().max(2_000).nullable(),
    finishedAt: timestampSchema.nullable(),
    id: stableIdSchema,
    inputSummary: automationJsonValueSchema.nullable(),
    outputSummary: automationJsonValueSchema.nullable(),
    startedAt: timestampSchema.nullable(),
    status: databaseAutomationStepStatusSchema,
  })
  .strict()
export type DatabaseAutomationStepRun = z.infer<
  typeof databaseAutomationStepRunSchema
>

export const databaseAutomationRunSchema = z
  .object({
    automationId: stableIdSchema,
    durationMs: z.number().int().min(0).nullable(),
    errorCode: z.string().max(200).nullable(),
    errorSummary: z.string().max(2_000).nullable(),
    finishedAt: timestampSchema.nullable(),
    id: stableIdSchema,
    revisionId: stableIdSchema,
    scheduledFor: timestampSchema.nullable(),
    skipReason: z.string().max(500).nullable(),
    startedAt: timestampSchema.nullable(),
    status: databaseAutomationRunStatusSchema,
    steps: z.array(databaseAutomationStepRunSchema).optional(),
    triggerActorId: stableIdSchema.nullable(),
    triggerPageId: stableIdSchema.nullable(),
    triggerRowId: stableIdSchema.nullable(),
    triggerTime: timestampSchema,
  })
  .strict()
export type DatabaseAutomationRun = z.infer<
  typeof databaseAutomationRunSchema
>

export const databaseAutomationDeliverySchema = z
  .object({
    actionId: stableIdSchema,
    attempts: z.number().int().min(0),
    deliveryId: stableIdSchema,
    destinationHash: stableIdSchema,
    errorCode: z.string().max(200).nullable(),
    errorSummary: z.string().max(2_000).nullable(),
    kind: z.enum(["notification", "gmail", "webhook", "slack"]),
    nextAttemptAt: timestampSchema.nullable(),
    providerReference: z.string().max(1_000).nullable(),
    responseStatus: z.number().int().min(100).max(599).nullable(),
    runId: stableIdSchema,
    status: databaseAutomationDeliveryStatusSchema,
  })
  .strict()
export type DatabaseAutomationDelivery = z.infer<
  typeof databaseAutomationDeliverySchema
>

export const databaseAutomationCatalogSchema = z
  .object({
    actions: z.array(
      z.object({ available: z.boolean(), reason: z.string().nullable(), type: z.enum([
        "define_variables",
        "edit_trigger_page",
        "add_page",
        "edit_pages",
        "send_notification",
        "send_gmail",
        "send_webhook",
        "send_slack",
      ]) }).strict(),
    ),
    canManage: z.boolean(),
    dataSourceId: stableIdSchema,
    gmailConnections: z.array(
      z.object({
        email: z.string().email(),
        id: stableIdSchema,
        status: z.enum(["connected", "reconnect_required"]),
      }).strict(),
    ),
    slackConnections: z.array(
      z.object({
        id: stableIdSchema,
        status: z.enum(["connected", "revoked"]),
        teamId: stableIdSchema,
        teamName: shortTextSchema,
      }).strict(),
    ),
    manageUnavailableReason: z.string().nullable(),
    properties: z.array(
      z.object({
        id: stableIdSchema,
        name: shortTextSchema,
        operators: z.array(databaseAutomationTriggerOperatorSchema),
        type: shortTextSchema,
        writable: z.boolean(),
      }).strict(),
    ),
    users: z.array(
      z.object({ id: stableIdSchema, name: shortTextSchema }).strict(),
    ),
    views: z.array(
      z.object({ id: stableIdSchema, name: shortTextSchema, type: shortTextSchema }).strict(),
    ),
  })
  .strict()
export type DatabaseAutomationCatalog = z.infer<
  typeof databaseAutomationCatalogSchema
>

export const slackAutomationChannelSchema = z.object({
  id: stableIdSchema,
  isPrivate: z.boolean(),
  name: shortTextSchema,
}).strict()
export type SlackAutomationChannel = z.infer<typeof slackAutomationChannelSchema>

export const createDatabaseAutomationSecretRequestSchema = z.object({
  dataSourceId: stableIdSchema,
  purpose: z.literal("webhook_header"),
  value: z.string().min(1).max(16_384),
}).strict()
export type CreateDatabaseAutomationSecretRequest = z.infer<typeof createDatabaseAutomationSecretRequestSchema>

export const databaseAutomationSecretReferenceSchema = z.object({
  id: stableIdSchema,
  purpose: z.literal("webhook_header"),
}).strict()
export type DatabaseAutomationSecretReference = z.infer<typeof databaseAutomationSecretReferenceSchema>

export const createDatabaseAutomationRequestSchema = z
  .object({
    dataSourceId: stableIdSchema,
    definition: databaseAutomationDefinitionSchema,
    idempotencyKey: stableIdSchema,
    name: shortTextSchema,
  })
  .strict()
export type CreateDatabaseAutomationRequest = z.infer<
  typeof createDatabaseAutomationRequestSchema
>

export const updateDatabaseAutomationRequestSchema = z
  .object({
    definition: databaseAutomationDefinitionSchema,
    name: shortTextSchema,
  })
  .strict()
export type UpdateDatabaseAutomationRequest = z.infer<
  typeof updateDatabaseAutomationRequestSchema
>

export const validateDatabaseAutomationRequestSchema = z
  .object({
    dataSourceId: stableIdSchema,
    definition: databaseAutomationDefinitionSchema,
  })
  .strict()
export type ValidateDatabaseAutomationRequest = z.infer<
  typeof validateDatabaseAutomationRequestSchema
>
