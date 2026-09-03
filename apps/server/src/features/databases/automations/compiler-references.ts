import type { AutomationReference } from "@zilobase/features/databases/automations";

export function optionReferenceIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(optionReferenceIds))];
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.entityType === "option" && record.type === "entity" && typeof record.id === "string") {
    return [record.id];
  }
  if (record.entityType === "option" && record.type === "entity_list" && Array.isArray(record.ids)) {
    return [...new Set(record.ids.filter((id): id is string => typeof id === "string"))];
  }
  return Object.values(record).flatMap(optionReferenceIds);
}

export function visitReferences(
  value: unknown,
  visitor: (reference: AutomationReference, path: Array<string | number>) => void,
  path: Array<string | number> = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitReferences(item, visitor, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "reference" && typeof record.reference === "string") {
    visitor(record as AutomationReference, path);
  }
  for (const [key, item] of Object.entries(record)) visitReferences(item, visitor, [...path, key]);
}

export function visitFormulaExpressions(
  value: unknown,
  visitor: (expression: string, path: Array<string | number>) => void,
  path: Array<string | number> = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitFormulaExpressions(item, visitor, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "formula" && typeof record.expression === "string") {
    visitor(record.expression, [...path, "expression"]);
  }
  for (const [key, item] of Object.entries(record)) {
    visitFormulaExpressions(item, visitor, [...path, key]);
  }
}
