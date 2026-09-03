import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { type AutomationJsonValue, type AutomationFilterDefinition, type AutomationValueExpression, type DatabaseAutomationAction, type DatabaseAutomationDefinition } from "@zilobase/features/databases/automations";
import { evaluateDatabaseFormula, type DatabaseFormulaProperty, getZonedDateParts } from "@zilobase/features/databases/formula";
import { db } from "../../../infrastructure/database";
import { databaseRow, page, pagePropertyValue } from "../../../infrastructure/database/schema";
import { type ResolvedAutomationPropertyOperation } from "./internal-mutations";
import { matchesAutomationFilterDefinition } from "./trigger-evaluator";
import { AutomationActionError } from "./action-error";
import { type ExecutionContext, loadProperties } from "./execution-context";
export function resolveRichText(
  context: ExecutionContext,
  richText: Extract<DatabaseAutomationAction, { type: "send_notification" | "send_gmail" }>["message"],
  options: { label?: string; maxLength?: number } = {},
) {
  const message = richText.parts.map((part) =>
    part.type === "text" ? part.text : displayValue(resolveExpression(context, part.value))
  ).join("");
  const maxLength = options.maxLength ?? 20_000;
  if (message.length > maxLength) {
    throw new AutomationActionError(`${options.label ?? "Notification message"} exceeds ${maxLength.toLocaleString()} characters`, "AUTOMATION_MESSAGE_LIMIT");
  }
  return message;
}


export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (typeof value === "object") return scalarString(value) ?? "";
  return String(value);
}


export function scalarString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : null;
}


export function userIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const id = scalarString(item);
    return id ? [id] : [];
  });
}


export function resolveExpression(context: ExecutionContext, expression: AutomationValueExpression): unknown {
  if (expression.type === "literal") return expression.value;
  if (expression.type === "formula") {
    const row = context.row;
    const result = evaluateDatabaseFormula({
      expression: expression.expression,
      now: context.run.triggerTime,
      properties: context.properties as DatabaseFormulaProperty[],
      propertyValuesByKey: Object.fromEntries(
        Object.entries(context.propertyValues).map(([propertyId, value]) => [
          `${row?.pageId ?? "scheduled"}:${propertyId}`,
          formulaPropertyValue(value),
        ]),
      ),
      row: {
        createdAt: row?.createdAt.toISOString() ?? context.run.triggerTime.toISOString(),
        id: row?.id ?? `scheduled:${context.run.id}`,
        page: {
          createdAt: row?.pageCreatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
          name: row?.title ?? "Scheduled automation",
          updatedAt: row?.pageUpdatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
        },
        pageId: row?.pageId ?? `scheduled:${context.run.id}`,
        updatedAt: row?.updatedAt.toISOString() ?? context.run.triggerTime.toISOString(),
      },
      timezone: context.definition.timezone,
      titlePropertyLabel: "Name",
      variables: context.variables,
    });
    if (!result.ok) throw new AutomationActionError(result.error, "AUTOMATION_FORMULA_FAILED");
    return result.value;
  }
  switch (expression.reference) {
    case "trigger_page": return requireTriggerRow(context).pageId;
    case "trigger_property": return context.propertyValues[expression.propertyId] ?? null;
    case "trigger_person": return context.run.triggerActorId;
    case "page_creator": return requireTriggerRow(context).createdById;
    case "page_last_editor": return requireTriggerRow(context).lastEditedById;
    case "now": return context.run.triggerTime.toISOString();
    case "today": return zonedDate(context.run.triggerTime, context.definition.timezone);
    case "variable": return context.variables[expression.name] ?? null;
    case "action_output": return context.actionOutputs[expression.actionId]?.[expression.output] ?? null;
    case "selected_person": return expression.userId;
    case "selected_page": return expression.pageId;
    case "selected_group": return expression.groupId;
    case "selected_teamspace": return expression.teamspaceId;
  }
}


export function resolveOperations(
  context: ExecutionContext,
  operations: Array<{ mode: "add" | "clear" | "remove" | "set"; propertyId: string; value?: AutomationValueExpression }>,
): ResolvedAutomationPropertyOperation[] {
  return operations.map((operation) => ({
    mode: operation.mode,
    propertyId: operation.propertyId,
    ...(operation.value ? { value: resolveExpression(context, operation.value) } : {}),
  }));
}


export async function resolveEditTarget(
  context: ExecutionContext,
  action: Extract<DatabaseAutomationAction, { type: "edit_pages" }>,
) {
  if (action.target.type === "variable_pages") {
    const pageIds = stringList(context.variables[action.target.variableName]);
    return {
      dataSourceId: context.run.dataSourceId,
      rows: await rowsForPages(context.run.dataSourceId, pageIds),
    };
  }
  if (action.target.type === "related_pages") {
    requireTriggerRow(context);
    const target = action.target;
    const property = context.properties.find(
      (candidate) => candidate.property.id === target.propertyId,
    );
    const dataSourceId = relatedDataSourceId(property?.property.config);
    if (!dataSourceId) throw new AutomationActionError("Relation target is unavailable", "AUTOMATION_TARGET_INVALID");
    return {
      dataSourceId,
      rows: await rowsForPages(dataSourceId, stringList(context.propertyValues[target.propertyId])),
    };
  }
  const rows = await loadFilterTargetRows(
    action.target.dataSourceId,
    action.target.filter,
    context.definition,
    context.run.triggerTime,
  );
  return { dataSourceId: action.target.dataSourceId, rows };
}


export function requireTriggerRow(context: Pick<ExecutionContext, "row">) {
  if (!context.row) {
    throw new AutomationActionError(
      "Scheduled automations have no trigger page",
      "AUTOMATION_TRIGGER_MISSING",
    );
  }
  return context.row;
}


async function loadFilterTargetRows(
  dataSourceId: string,
  filter: AutomationFilterDefinition,
  definition: DatabaseAutomationDefinition,
  now = new Date(),
) {
  const [rows, properties] = await Promise.all([
    db
      .select({ pageId: databaseRow.pageId, rowId: databaseRow.id, title: page.name })
      .from(databaseRow)
      .innerJoin(page, eq(page.id, databaseRow.pageId))
      .where(and(eq(databaseRow.dataSourceId, dataSourceId), isNull(databaseRow.deletedAt), isNull(page.deletedAt)))
      .orderBy(asc(databaseRow.position))
      .limit(1_001),
    loadProperties(dataSourceId),
  ]);
  if (rows.length > 1_000) throw new AutomationActionError("Edit-pages target exceeds 1,000 rows", "AUTOMATION_ROW_LIMIT");
  const values = rows.length
    ? await db
        .select({ pageId: pagePropertyValue.pageId, propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
        .from(pagePropertyValue)
        .where(inArray(pagePropertyValue.pageId, rows.map((row) => row.pageId)))
    : [];
  const propertyMap = new Map(properties.map((property) => [property.property.id, {
    config: property.property.config,
    id: property.property.id,
    type: property.property.type,
  }]));
  return rows
    .filter((row) => matchesAutomationFilterDefinition(filter, {
      afterValues: {
        ...Object.fromEntries(values.filter((value) => value.pageId === row.pageId).map((value) => [value.propertyId, value.value])),
        name: row.title,
      },
      changedPropertyIds: [],
      now,
      properties: propertyMap,
      rowAdded: false,
      timezone: definition.timezone,
    }))
    .map(({ pageId, rowId }) => ({ pageId, rowId }));
}


async function rowsForPages(dataSourceId: string, pageIds: string[]) {
  if (pageIds.length > 1_000) throw new AutomationActionError("Edit-pages target exceeds 1,000 rows", "AUTOMATION_ROW_LIMIT");
  if (!pageIds.length) return [];
  return db
    .select({ pageId: databaseRow.pageId, rowId: databaseRow.id })
    .from(databaseRow)
    .where(
      and(
        eq(databaseRow.dataSourceId, dataSourceId),
        inArray(databaseRow.pageId, pageIds),
        isNull(databaseRow.deletedAt),
      ),
    );
}


export function restoreStepOutput(
  context: Pick<ExecutionContext, "actionOutputs" | "variables">,
  actionId: string,
  output: unknown,
) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return;
  const record = output as Record<string, unknown>;
  context.actionOutputs[actionId] = record;
  if (record.variables && typeof record.variables === "object" && !Array.isArray(record.variables)) {
    Object.assign(context.variables, record.variables);
  }
}


export function assertBoundedValue(value: unknown) {
  if (Array.isArray(value) && value.length > 1_000) {
    throw new AutomationActionError("Variable list exceeds 1,000 items", "AUTOMATION_VARIABLE_LIMIT");
  }
  if (JSON.stringify(toJson(value)).length > 65_536) {
    throw new AutomationActionError("Variable exceeds 64 KiB", "AUTOMATION_VARIABLE_LIMIT");
  }
}


export function toJson(value: unknown): AutomationJsonValue {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJson(item)]));
  }
  return (value ?? null) as AutomationJsonValue;
}


export const stableActionSuffix = (runId: string, actionId: string) =>
  createHash("sha256").update(`${runId}:${actionId}`).digest("hex").slice(0, 32);


export const requireOwner = (ownerUserId: string | null) => {
  if (!ownerUserId) throw new AutomationActionError("Automation owner is unavailable", "AUTOMATION_OWNER_REVOKED");
  return ownerUserId;
};


export const stringList = (value: unknown) =>
  (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string");


function relatedDataSourceId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const relation = (config as { relation?: unknown }).relation;
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return null;
  const id = (relation as { relatedDataSourceId?: unknown }).relatedDataSourceId;
  return typeof id === "string" ? id : null;
}


function formulaPropertyValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized = formulaPropertyValue(item);
      return Array.isArray(normalized) ? normalized : [normalized];
    });
  }
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (["boolean", "number", "string"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}


function zonedDate(value: Date, timezone: string) {
  const parts = getZonedDateParts(value, timezone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
