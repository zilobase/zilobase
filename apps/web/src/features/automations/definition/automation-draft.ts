import type {
  AutomationTriggerOperand,
  DatabaseAutomationCatalog,
  DatabaseAutomationDefinition,
  DatabaseAutomationEventTriggerClause,
  DatabaseAutomationTriggerOperator,
} from "@zilobase/features/automations";
import {
  actionForDefinition,
  notionActionDraftFromAction,
  notionActionLabel,
  type NotionActionDraft,
} from "../actions/notion-action-model";
import {
  scheduleDefinition,
  scheduleDraft,
  type ScheduleDraft,
} from "./schedule-model";

export type TriggerDraft = {
  id: string;
  operands: string[];
  operator: DatabaseAutomationTriggerOperator;
  propertyId: string;
  type: "page_added" | "property_edited";
};

export type TriggerPickerSelection =
  | { type: "page_added" }
  | {
      operands?: string[];
      operator?: DatabaseAutomationTriggerOperator;
      propertyId: string;
      type: "property_edited";
    }
  | { type: "schedule" };

export type EventTriggerPickerSelection = Exclude<
  TriggerPickerSelection,
  { type: "schedule" }
>;

export type BuilderDraft = {
  actions: NotionActionDraft[];
  customName: boolean;
  match: "all" | "any";
  name: string;
  schedule: ScheduleDraft;
  scopeViewId: string;
  triggerKind: "event" | "schedule";
  triggers: TriggerDraft[];
};

export const operandless = new Set<DatabaseAutomationTriggerOperator>([
  "is_checked",
  "is_empty",
  "is_not_empty",
  "is_unchecked",
  "was_edited",
]);

export function isChoiceTriggerProperty(propertyType: string) {
  return ["multi_select", "select", "status"].includes(propertyType);
}

export function triggerConfigurationTitle(
  trigger: TriggerDraft,
  property: DatabaseAutomationCatalog["properties"][number],
) {
  if (isChoiceTriggerProperty(property.type)) {
    return `${property.name} set to`;
  }
  return `${property.name} ${triggerOperatorLabel(trigger.operator).toLowerCase()}`;
}

export function triggerOperatorLabel(
  operator: DatabaseAutomationTriggerOperator,
) {
  if (operator === "was_edited") return "Is edited";
  if (operator === "is") return "Set to";
  return humanize(operator);
}

export function emptyDraft(): BuilderDraft {
  return {
    actions: [],
    customName: false,
    match: "any",
    name: "",
    schedule: newSchedule(),
    scopeViewId: "",
    triggerKind: "event",
    triggers: [],
  };
}

export const triggerFromSelection = (
  selection: EventTriggerPickerSelection,
  id: string,
  catalog?: DatabaseAutomationCatalog,
): TriggerDraft =>
  selection.type === "page_added"
    ? {
        id,
        operands: [],
        operator: "was_edited",
        propertyId: "any",
        type: "page_added",
      }
    : {
        id,
        operands: selection.operands ?? [],
        operator:
          selection.operator ??
          (selection.propertyId === "any"
            ? "was_edited"
            : (catalog?.properties.find(
                (property) => property.id === selection.propertyId,
              )?.operators[0] ?? "was_edited")),
        propertyId: selection.propertyId,
        type: "property_edited",
      };

const newSchedule = (): ScheduleDraft => ({
  customPattern: "daily",
  dayOfMonth: "1",
  endDate: "",
  frequency: "daily",
  interval: 1,
  localTime: "09:00",
  months: [1],
  startDate: new Date().toISOString().slice(0, 10),
  weekdays: [new Date().getDay()],
});

export function buildDefinition(
  draft: BuilderDraft,
  timezone: string,
  catalog?: DatabaseAutomationCatalog,
): DatabaseAutomationDefinition | null {
  if (draft.actions.length === 0) return null;
  if (draft.triggerKind === "event" && draft.triggers.length === 0) return null;
  if (
    draft.triggerKind === "event" &&
    draft.triggers.some(
      (trigger) =>
        trigger.type === "property_edited" &&
        !operandless.has(trigger.operator) &&
        !hasRequiredTriggerValues(trigger),
    )
  )
    return null;
  const clauses: DatabaseAutomationEventTriggerClause[] = draft.triggers.map(
    (trigger) =>
      trigger.type === "page_added"
        ? { id: trigger.id, type: "page_added" }
        : {
            id: trigger.id,
            operator: trigger.operator,
            propertyId: trigger.propertyId,
            type: "property_edited",
            ...(operandless.has(trigger.operator)
              ? {}
              : {
                  operand: parseOperand(
                    trigger.operands,
                    catalog?.properties.find(
                      (property) => property.id === trigger.propertyId,
                    )?.type,
                    trigger.operator,
                  ),
                }),
          },
  );
  const actions = draft.actions.map(actionForDefinition);
  const trigger: DatabaseAutomationDefinition["trigger"] =
    draft.triggerKind === "event"
      ? { clauses, kind: "event", match: draft.match }
      : {
          kind: "schedule",
          schedule: scheduleDefinition(draft.schedule, timezone),
        };
  return {
    actions,
    definitionVersion: 1,
    scope: draft.scopeViewId
      ? { type: "view", viewId: draft.scopeViewId }
      : { type: "data_source" },
    timezone,
    trigger,
  };
}

function parseOperand(
  values: string[],
  propertyType = "",
  operator: DatabaseAutomationTriggerOperator,
): AutomationTriggerOperand {
  const value = values[0] ?? "";
  if (propertyType === "number") return Number(value);
  if (propertyType === "checkbox") return value === "true";
  if (propertyType === "date") return parseDateOperand(values, operator);
  if (["select", "status", "multi_select", "person"].includes(propertyType)) {
    const entityType = propertyType === "person" ? "user" : "option";
    return values.length > 1
      ? { entityType, ids: values, type: "entity_list" }
      : { entityType, id: value, type: "entity" };
  }
  if (propertyType === "relation")
    return { entityType: "page", id: value, type: "entity" };
  return value;
}

export function hasRequiredTriggerValues(trigger: TriggerDraft) {
  if (trigger.operator === "is_between") {
    return Boolean(trigger.operands[0]?.trim() && trigger.operands[1]?.trim());
  }
  return Boolean(trigger.operands[0]?.trim());
}

export function nextTriggerOperands(
  trigger: TriggerDraft,
  operator: DatabaseAutomationTriggerOperator,
  propertyType?: string,
) {
  if (operandless.has(operator)) return [];
  if (operator === "is_relative_to_today") {
    return [
      trigger.operands[0]?.startsWith("relative:")
        ? trigger.operands[0]
        : "relative:this:week",
    ];
  }
  if (
    ["multi_select", "person", "select", "status"].includes(propertyType ?? "")
  ) {
    return trigger.operands;
  }
  return trigger.operands.slice(0, operator === "is_between" ? 2 : 1);
}

export function generateName(
  draft: BuilderDraft,
  catalog?: DatabaseAutomationCatalog,
) {
  if (draft.triggerKind === "schedule") {
    return `${humanize(draft.schedule.frequency)} at ${draft.schedule.localTime} → ${draft.actions[0] ? notionActionLabel(draft.actions[0].action.type) : "Run actions"}`;
  }
  const trigger = draft.triggers[0];
  const action = draft.actions[0];
  if (!trigger && !action) return "New automation";
  const when = describeEventTrigger(trigger, catalog);
  const then = action ? notionActionLabel(action.action.type) : "Add action";
  return `${when} → ${then}`;
}

export function draftFromDefinition(
  name: string,
  definition: DatabaseAutomationDefinition,
): BuilderDraft {
  const base = emptyDraft();
  return {
    actions: definition.actions.map(notionActionDraftFromAction),
    customName: true,
    match:
      definition.trigger.kind === "event" ? definition.trigger.match : "any",
    name,
    schedule:
      definition.trigger.kind === "schedule"
        ? scheduleDraft(definition.trigger.schedule)
        : base.schedule,
    scopeViewId:
      definition.scope.type === "view" ? definition.scope.viewId : "",
    triggerKind: definition.trigger.kind,
    triggers:
      definition.trigger.kind === "event"
        ? definition.trigger.clauses.map(
            (clause): TriggerDraft =>
              clause.type === "page_added"
                ? {
                    id: clause.id,
                    operands: [],
                    operator: "was_edited",
                    propertyId: "any",
                    type: "page_added",
                  }
                : {
                    id: clause.id,
                    operands: triggerOperandValues(clause.operand),
                    operator: clause.operator,
                    propertyId: clause.propertyId,
                    type: "property_edited",
                  },
          )
        : base.triggers,
  };
}

function triggerOperandValues(
  operand: AutomationTriggerOperand | undefined,
): string[] {
  if (operand === undefined || operand === null) return [];
  if (typeof operand !== "object") return [String(operand)];
  if (operand.type === "entity") return [operand.id];
  if (operand.type === "entity_list") return operand.ids;
  if (operand.type === "date") return [operand.value.slice(0, 10)];
  if (operand.type === "date_range")
    return [operand.start.slice(0, 10), operand.end.slice(0, 10)];
  return [`relative:${operand.direction}:${operand.unit}`];
}

export function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export const humanize = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function parseDateOperand(
  values: string[],
  operator: DatabaseAutomationTriggerOperator,
): AutomationTriggerOperand {
  const value = values[0] ?? "";
  if (operator === "is_between")
    return {
      end: new Date(values[1] ?? value).toISOString(),
      start: new Date(value).toISOString(),
      type: "date_range",
    };
  if (operator === "is_relative_to_today") {
    const [, direction = "this", unit = "week"] = value.split(":");
    return {
      amount: 1,
      direction: direction as "next" | "past" | "this",
      type: "relative_date",
      unit: unit as "day" | "month" | "week" | "year",
    };
  }
  return {
    precision: "date",
    type: "date",
    value: new Date(value || Date.now()).toISOString(),
  };
}

function describeEventTrigger(
  trigger: TriggerDraft | undefined,
  catalog?: DatabaseAutomationCatalog,
) {
  if (!trigger) return "Add trigger";
  if (trigger.type === "page_added") return "When page added";
  const property = catalog?.properties.find(
    (item) => item.id === trigger.propertyId,
  )?.name;
  return `When ${property ?? "property"} edited`;
}
