import {
  isReadOnlyPropertyType as isCanonicalReadOnlyPropertyType,
  isSelectLikePropertyType as isCanonicalSelectLikePropertyType,
} from "./property-types";

export const defaultStatusOption = {
  color: "gray",
  group: "To-do",
  id: "not-started",
  name: "Not started",
};

export const defaultStatusOptions = [
  defaultStatusOption,
  {
    color: "blue",
    group: "In progress",
    id: "in-progress",
    name: "In progress",
  },
  {
    color: "green",
    group: "Complete",
    id: "done",
    name: "Done",
  },
];

/** The same effective scalar is used by rendering, filtering, and server reads. */
export function getEffectiveStatusValue(value: unknown, config?: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  const settings = config as { defaultOptionId?: unknown; options?: unknown } | null;
  const options = Array.isArray(settings?.options) ? settings.options : [];
  const option = options.find(
    (entry) => entry && typeof entry === "object" && entry.id === settings?.defaultOptionId,
  );
  return typeof option?.name === "string" && option.name.trim()
    ? option.name
    : defaultStatusOption.name;
}

export function getDefaultDatabasePropertyConfig(type: string) {
  if (type === "status") {
    return {
      defaultOptionId: defaultStatusOption.id,
      options: defaultStatusOptions,
    };
  }

  if (type === "formula") {
    return { formula: "" };
  }

  return undefined;
}

export function isReadOnlyPropertyType(type: string) {
  return isCanonicalReadOnlyPropertyType(type);
}

export function isSelectLikePropertyType(type: string) {
  return isCanonicalSelectLikePropertyType(type);
}
