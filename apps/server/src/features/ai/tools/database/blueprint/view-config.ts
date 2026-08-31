import type { DatabaseBlueprintInput } from "./schema";

export type BlueprintPropertyRecord = {
  databasePropertyId: string;
  key: string;
  name: string;
  pagePropertyId: string;
  type: string;
};

export function resolveDatabaseBlueprintViewConfig(
  view: DatabaseBlueprintInput["views"][number],
  propertiesByReference: Map<string, BlueprintPropertyRecord>,
) {
  const filters = view.filters?.map((filter) => ({
    id: crypto.randomUUID(),
    ...(filter.joinOperator ? { joinOperator: filter.joinOperator } : {}),
    operator: filter.operator,
    propertyId: resolveBlueprintDatabasePropertyId(
      filter.property,
      propertiesByReference,
    ),
    values: filter.values,
  }));
  const sorts = view.sorts?.map((sort) => ({
    column: resolveBlueprintDatabasePropertyId(
      sort.property,
      propertiesByReference,
    ),
    direction: sort.direction,
  }));
  const hiddenPropertyIds = view.hiddenProperties?.map((reference) =>
    resolveBlueprintDatabasePropertyId(reference, propertiesByReference)
  );
  const explicitGroup = view.groupBy
    ? requireBlueprintProperty(view.groupBy, propertiesByReference)
    : null;
  const inferredGroup = view.type === "kanban" && !explicitGroup
    ? [...new Set(propertiesByReference.values())].find(
        (property) =>
          property.type === "status" ||
          property.type === "select" ||
          property.type === "multi_select",
      ) ?? null
    : null;
  const explicitDate = view.timelineDateProperty
    ? requireBlueprintProperty(view.timelineDateProperty, propertiesByReference)
    : null;
  const inferredDate = view.type === "timeline" && !explicitDate
    ? [...new Set(propertiesByReference.values())].find(
        (property) => property.type === "date",
      ) ?? null
    : null;

  return {
    ...(filters?.length ? { filters } : {}),
    ...((explicitGroup ?? inferredGroup)
      ? { groupPropertyId: (explicitGroup ?? inferredGroup)!.pagePropertyId }
      : {}),
    ...(hiddenPropertyIds?.length ? { hiddenPropertyIds } : {}),
    ...(sorts?.length ? { sorts } : {}),
    ...((explicitDate ?? inferredDate)
      ? { datePropertyId: (explicitDate ?? inferredDate)!.pagePropertyId }
      : {}),
  };
}

export function requireBlueprintProperty(
  reference: string,
  propertiesByReference: Map<string, BlueprintPropertyRecord>,
) {
  const property = propertiesByReference.get(normalizeBlueprintReference(reference));
  if (!property) {
    throw new Error(`Unknown database property reference “${reference}”.`);
  }
  return property;
}

export function normalizeBlueprintReference(value: string) {
  return value.trim().toLowerCase();
}

function resolveBlueprintDatabasePropertyId(
  reference: string,
  propertiesByReference: Map<string, BlueprintPropertyRecord>,
) {
  return normalizeBlueprintReference(reference) === "name"
    ? "name"
    : requireBlueprintProperty(reference, propertiesByReference)
        .databasePropertyId;
}
