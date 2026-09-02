import type {
  AutomationFilterDefinition,
  AutomationTriggerOperand,
  DatabaseAutomationDefinition,
  DatabaseAutomationTriggerOperator,
} from "@zilobase/features/databases/automations";
import { getZonedDateParts } from "@zilobase/features/databases/formula";

export type AutomationTriggerProperty = {
  config?: unknown;
  id: string;
  type: string;
};

export type AutomationEventInput = {
  afterValues: Record<string, unknown>;
  changedPropertyIds: string[];
  now: Date;
  properties: Map<string, AutomationTriggerProperty>;
  rowAdded: boolean;
  timezone: string;
};

export function matchesAutomationFilterDefinition(
  filter: AutomationFilterDefinition,
  input: AutomationEventInput,
): boolean {
  const results = filter.conditions.map((condition) => {
    if ("match" in condition) {
      return matchesAutomationFilterDefinition(condition, input);
    }
    return matchesOperator({
      operand: condition.operand,
      operator: condition.operator,
      property: input.properties.get(condition.propertyId) ?? {
        id: condition.propertyId,
        type: condition.propertyId === "name" ? "title" : "text",
      },
      timezone: input.timezone,
      value: input.afterValues[condition.propertyId],
      now: input.now,
    });
  });
  return filter.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function matchesDatabaseAutomationEvent(
  definition: DatabaseAutomationDefinition,
  input: AutomationEventInput,
) {
  if (definition.trigger.kind !== "event") return false;
  const results = definition.trigger.clauses.map((clause) => {
    if (clause.type === "page_added") return input.rowAdded;
    if (clause.propertyId === "any") {
      return input.changedPropertyIds.length > 0;
    }
    if (!input.changedPropertyIds.includes(clause.propertyId)) return false;
    if (clause.operator === "was_edited") return true;
    return matchesOperator({
      operand: clause.operand,
      operator: clause.operator,
      property: input.properties.get(clause.propertyId) ?? {
        id: clause.propertyId,
        type: clause.propertyId === "name" ? "title" : "text",
      },
      timezone: input.timezone,
      value: input.afterValues[clause.propertyId],
      now: input.now,
    });
  });
  return definition.trigger.match === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function matchesOperator(input: {
  now: Date;
  operand?: AutomationTriggerOperand;
  operator: DatabaseAutomationTriggerOperator;
  property: AutomationTriggerProperty;
  timezone: string;
  value: unknown;
}) {
  const { operator, value } = input;
  if (operator === "is_empty") return isEmpty(value);
  if (operator === "is_not_empty") return !isEmpty(value);
  if (operator === "is_checked") return value === true;
  if (operator === "is_unchecked") return value !== true;

  const operand = normalizeOperand(input.operand, input.property);
  if (input.property.type === "date") {
    return matchesDate(value, input.operand, operator, input.now, input.timezone);
  }
  if (input.property.type === "number") {
    const left = number(value);
    const right = number(operand);
    if (left === null || right === null) return operator === "is_not";
    if (operator === "greater_than") return left > right;
    if (operator === "less_than") return left < right;
    if (operator === "greater_than_or_equal") return left >= right;
    if (operator === "less_than_or_equal") return left <= right;
    return operator === "is_not" ? left !== right : left === right;
  }

  const leftValues = list(value).map(normalizeText);
  const right = normalizeText(operand);
  if (operator === "contains") {
    return leftValues.some((item) => item.includes(right));
  }
  if (operator === "does_not_contain") {
    return !leftValues.some((item) => item.includes(right));
  }
  if (operator === "starts_with") {
    return leftValues.some((item) => item.startsWith(right));
  }
  if (operator === "ends_with") {
    return leftValues.some((item) => item.endsWith(right));
  }
  const equal = leftValues.some((item) => item === right);
  return operator === "is_not" ? !equal : equal;
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

const normalizeText = (value: unknown) =>
  String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [value];

const number = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function normalizeOperand(
  operand: AutomationTriggerOperand | undefined,
  property: AutomationTriggerProperty,
) {
  if (!operand || typeof operand !== "object" || !("type" in operand)) {
    return operand;
  }
  if (operand.type !== "entity") return operand;
  if (!property.config || typeof property.config !== "object") return operand.id;
  const options = (property.config as { options?: unknown }).options;
  if (!Array.isArray(options)) return operand.id;
  const option = options.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      (candidate as { id?: unknown }).id === operand.id,
  ) as { name?: unknown } | undefined;
  return typeof option?.name === "string" ? option.name : operand.id;
}

function matchesDate(
  value: unknown,
  operand: AutomationTriggerOperand | undefined,
  operator: DatabaseAutomationTriggerOperator,
  now: Date,
  timezone: string,
) {
  const left = parseDateValue(value);
  if (!left) return operator === "is_not";
  if (!operand || typeof operand !== "object" || !("type" in operand)) return false;
  if (operand.type === "relative_date") {
    const current = zonedDay(now, timezone);
    const candidate = zonedDay(left, timezone);
    const distance = dayDistance(current, candidate);
    if (operand.direction === "this") return distance === 0;
    const maximum = Math.max(operand.amount, 1) * daysPerUnit(operand.unit);
    return operand.direction === "past"
      ? distance <= -1 && distance >= -maximum
      : distance >= 1 && distance <= maximum;
  }
  if (operand.type === "date_range") {
    const start = new Date(operand.start);
    const end = new Date(operand.end);
    return left >= start && left <= end;
  }
  if (operand.type !== "date") return false;
  const right = new Date(operand.value);
  const comparison = operand.precision === "date"
    ? dayDistance(zonedDay(right, timezone), zonedDay(left, timezone))
    : left.getTime() - right.getTime();
  if (operator === "is_not") return comparison !== 0;
  if (operator === "is_before") return comparison < 0;
  if (operator === "is_after") return comparison > 0;
  if (operator === "is_on_or_before") return comparison <= 0;
  if (operator === "is_on_or_after") return comparison >= 0;
  return comparison === 0;
}

function parseDateValue(value: unknown) {
  const candidate =
    value && typeof value === "object" && "start" in value
      ? (value as { start?: unknown }).start
      : value;
  if (typeof candidate !== "string" && !(candidate instanceof Date)) return null;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function zonedDay(date: Date, timezone: string) {
  const parts = getZonedDateParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

const dayDistance = (start: number, end: number) =>
  Math.round((end - start) / 86_400_000);

const daysPerUnit = (unit: "day" | "week" | "month" | "year") =>
  unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 31 : 366;
