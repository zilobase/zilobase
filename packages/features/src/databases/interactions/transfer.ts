import type { DatabasePropertyEntity, DatabaseRecordEntity } from "../core/entities";
import { isReadOnlyPropertyType, normalizeDatabasePropertyType } from "../schema/property-types";

export const getPropertyNameKey = (name: string) => name.trim().toLowerCase();

export function normalizeValueForPropertyType(propertyType: string, value: unknown) {
  if (propertyType === "multi_select") {
    if (typeof value === "string") return [value];
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  }
  if (propertyType === "select" || propertyType === "status") {
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value.find((item): item is string => typeof item === "string") ?? null;
    return null;
  }
  return value;
}

export function previewTransferredValues(input: {
  record: DatabaseRecordEntity;
  sourceProperties: DatabasePropertyEntity[];
  targetProperties: DatabasePropertyEntity[];
  mode: "match" | "duplicate";
}) {
  const values: Record<string, unknown> = {};
  const targetIds = new Set(input.targetProperties.map(({ property }) => property.id));
  const targetNames = new Map(
    input.targetProperties.map(({ property }) => [getPropertyNameKey(property.name), property]),
  );
  for (const { property } of input.sourceProperties) {
    const current = input.record.valuesByPropertyId[property.id];
    if (!current) continue;
    if (targetIds.has(property.id) || input.mode === "duplicate") {
      values[property.id] = current.value;
      continue;
    }
    const target = targetNames.get(getPropertyNameKey(property.name));
    const type = target ? normalizeDatabasePropertyType(target.type) : null;
    if (!target || !type || isReadOnlyPropertyType(type) || current.value === null) continue;
    const value = normalizeValueForPropertyType(type, current.value);
    if (value !== null) values[target.id] = value;
  }
  return values;
}
