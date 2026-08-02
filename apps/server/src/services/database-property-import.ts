import {
  defaultStatusOptions,
  normalizePropertyConfig,
} from "./database-property-config";
import { isSelectLikePropertyType } from "./database-property-types";

export const getPropertyNameKey = (name: string) => name.trim().toLowerCase();

const readPropertyOptions = (
  type: string,
  config: unknown,
): Record<string, unknown>[] => {
  const rawOptions =
    config && typeof config === "object" && "options" in config
      ? (config as { options?: unknown }).options
      : null;
  const options = Array.isArray(rawOptions)
    ? rawOptions.filter(
        (option): option is Record<string, unknown> =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as { id?: unknown }).id === "string" &&
          typeof (option as { name?: unknown }).name === "string",
      )
    : [];

  return type === "status" && options.length === 0
    ? defaultStatusOptions.map((option) => ({ ...option }))
    : options.map((option) => ({ ...option }));
};

const getOptionValueNames = (propertyType: string, value: unknown) => {
  if (propertyType === "multi_select") {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : typeof value === "string" && value.length > 0
        ? [value]
        : [];
  }

  if (propertyType === "select" || propertyType === "status") {
    const optionName = Array.isArray(value) ? value[0] : value;

    return typeof optionName === "string" && optionName.length > 0
      ? [optionName]
      : [];
  }

  return [];
};

const getOptionId = (name: string, existingIds: Set<string>) => {
  const baseId =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "option";
  let id = baseId;
  let index = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  existingIds.add(id);
  return id;
};

export const normalizeValueForPropertyType = (
  propertyType: string,
  value: unknown,
) => {
  if (propertyType === "multi_select" && typeof value === "string") {
    return [value];
  }

  if (
    (propertyType === "select" || propertyType === "status") &&
    Array.isArray(value)
  ) {
    return value[0] ?? null;
  }

  return value;
};

export const mergeSelectOptionsForValue = (
  propertyType: string,
  config: unknown,
  value: unknown,
) => {
  if (!isSelectLikePropertyType(propertyType)) {
    return { changed: false, config };
  }

  const optionNames = getOptionValueNames(propertyType, value);

  if (optionNames.length === 0) {
    return { changed: false, config };
  }

  const options = readPropertyOptions(propertyType, config);
  const existingNames = new Set(
    options.map((option) => String(option.name).trim().toLowerCase()),
  );
  const existingIds = new Set(options.map((option) => String(option.id)));
  let changed = false;

  for (const name of optionNames) {
    const key = name.trim().toLowerCase();

    if (existingNames.has(key)) {
      continue;
    }

    options.push({ id: getOptionId(name, existingIds), name });
    existingNames.add(key);
    changed = true;
  }

  if (!changed) {
    return { changed: false, config };
  }

  const baseConfig =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  return {
    changed: true,
    config: normalizePropertyConfig(propertyType, {
      ...baseConfig,
      options,
    }),
  };
};

export const getDuplicatePropertyName = (
  name: string,
  existingNames: Set<string>,
) => {
  const trimmedName = name.trim() || "Property";
  const baseName = `${trimmedName} copy`;

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let index = 2;

  while (existingNames.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
};
