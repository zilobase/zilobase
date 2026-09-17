import type {
  AutomationJsonValue,
  DatabaseAutomationCatalog,
} from "@zilobase/features/automations";
import {
  notionActionLabel,
  type NotionActionDraft,
} from "./notion-action-model";

export function actionProperties(
  catalog?: DatabaseAutomationCatalog,
): DatabaseAutomationCatalog["properties"] {
  return [
    {
      id: "name",
      name: "Name",
      operators: [
        "was_edited",
        "is",
        "is_not",
        "contains",
        "does_not_contain",
        "starts_with",
        "ends_with",
        "is_empty",
        "is_not_empty",
      ],
      options: [],
      type: "title",
      writable: true,
    },
    ...(catalog?.properties.filter(({ writable }) => writable) ?? []),
  ];
}

export function canUseCompactPropertyAction(draft: NotionActionDraft) {
  if (
    draft.action.type !== "edit_trigger_page" ||
    draft.action.operations.length !== 1
  )
    return false;
  const operation = draft.action.operations[0];
  return operation?.mode === "set" && operation.value?.type === "literal";
}

export function actionValuesFromLiteral(
  value: AutomationJsonValue,
  propertyType: string,
): string[] {
  if (
    ["multi_select", "person", "relation", "select", "status"].includes(
      propertyType,
    )
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "id" in item &&
      typeof item.id === "string"
        ? [item.id]
        : [],
    );
  }
  return value === null ? [] : [String(value)];
}

export function actionLiteralFromValues(
  values: string[],
  propertyType: string,
): AutomationJsonValue {
  if (propertyType === "number") return Number(values[0] ?? 0);
  if (propertyType === "checkbox") return values[0] === "true";
  if (["select", "status"].includes(propertyType)) {
    return { entityType: "option", id: values[0] ?? "", type: "entity" };
  }
  const entityTypes: Record<string, "option" | "user" | "page"> = {
    multi_select: "option",
    person: "user",
    relation: "page",
  };
  const entityType = Object.hasOwn(entityTypes, propertyType)
    ? entityTypes[propertyType]
    : undefined;
  if (entityType)
    return values.map((id) => ({ entityType, id, type: "entity" }));
  return values[0] ?? "";
}

export function propertyActionLabel(
  draft: NotionActionDraft,
  catalog?: DatabaseAutomationCatalog,
) {
  if (draft.action.type !== "edit_trigger_page")
    return notionActionLabel(draft.action.type);
  const operation = draft.action.operations[0];
  if (!operation) return "Edit property";
  const property = actionProperties(catalog).find(
    (item) => item.id === operation.propertyId,
  ) ?? { name: "property", type: "text", options: [] };
  if (operation.mode === "clear") return `Clear ${property.name}`;
  if (operation.value?.type !== "literal") return `Set ${property.name}`;
  const values = actionValuesFromLiteral(operation.value.value, property.type);
  const labels = values.map(
    (value) =>
      property.options.find((option) => option.id === value)?.name ??
      catalog?.users.find((user) => user.id === value)?.name ??
      value,
  );
  return `Set ${property.name} to ${labels.join(", ") || "value"}`;
}
