import { defaultStatusOptions } from "../../schema/model/property-defaults";
import {
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
} from "../../schema/model/property-defaults";

export type DatabaseSelectOption = {
  color?: string;
  id: string;
  name: string;
};

export type DatabasePropertyListItem = {
  id: string;
  position: number;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

type DatabaseViewConfig = {
  groupPropertyId?: unknown;
};

export function isGroupProperty(property: DatabasePropertyListItem) {
  return Boolean(property.property.id);
}

export function isOptionBackedGroupProperty(property: DatabasePropertyListItem) {
  return isSelectLikePropertyType(property.property.type);
}

export function isReadOnlyGroupProperty(property: DatabasePropertyListItem) {
  return isReadOnlyPropertyType(property.property.type);
}

export function canUpdateGroupProperty(property: DatabasePropertyListItem) {
  return property.id !== "name" && !isReadOnlyGroupProperty(property);
}

export function canMoveRowsAcrossGroups(property: DatabasePropertyListItem) {
  return property.id === "name" || canUpdateGroupProperty(property);
}

export function canCreateRowInGroup(property: DatabasePropertyListItem) {
  return property.id === "name" || canUpdateGroupProperty(property);
}

export function canCreateKanbanGroup(property: DatabasePropertyListItem) {
  return (
    property.id === "name" ||
    isOptionBackedGroupProperty(property) ||
    ["date", "email", "number", "phone", "text", "url"].includes(property.property.type)
  );
}

export function getSelectOptions(config: unknown) {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return [];
  }

  const options = (config as { options?: unknown }).options;

  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter(
    (option): option is DatabaseSelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as DatabaseSelectOption).id === "string" &&
      typeof (option as DatabaseSelectOption).name === "string",
  );
}

export function getGroupPropertyId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const groupPropertyId = (config as DatabaseViewConfig).groupPropertyId;

  return typeof groupPropertyId === "string" && groupPropertyId.length > 0 ? groupPropertyId : null;
}

export function getConfiguredGroupProperty(
  properties: DatabasePropertyListItem[],
  config: unknown,
) {
  const configuredGroupPropertyId = getGroupPropertyId(config);

  return configuredGroupPropertyId
    ? (properties.find((property) => property.property.id === configuredGroupPropertyId) ?? null)
    : null;
}

export function getKanbanGroupProperty(properties: DatabasePropertyListItem[], config: unknown) {
  const configuredGroupPropertyId = getGroupPropertyId(config);
  const configuredGroupProperty = configuredGroupPropertyId
    ? (properties.find(
        (property) =>
          property.property.id === configuredGroupPropertyId && isGroupProperty(property),
      ) ?? null)
    : null;

  return (
    configuredGroupProperty ??
    properties.find((property) => property.property.type === "status") ??
    properties.find((property) => isSelectLikePropertyType(property.property.type)) ??
    properties[0] ??
    null
  );
}

export function getGroupOptions(property: DatabasePropertyListItem | null) {
  if (!property) {
    return [];
  }

  const options = getSelectOptions(property.property.config);

  if (options.length > 0) {
    return options;
  }

  return property.property.type === "status" ? defaultStatusOptions : [];
}
