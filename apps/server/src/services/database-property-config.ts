import {
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
  normalizeDatabasePropertyType,
} from "./database-property-types";
import { ServiceMutationError } from "./mutation-error";

export const defaultStatusOptions = [
  { color: "gray", group: "To-do", id: "not-started", name: "Not started" },
  {
    color: "blue",
    group: "In progress",
    id: "in-progress",
    name: "In progress",
  },
  { color: "green", group: "Complete", id: "done", name: "Done" },
] as const;

export const selectOptionColors = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

type PropertySelectOption = {
  color?: string;
  group?: string;
  id: string;
  name: string;
};

type StatusOption = { id: string; name: string };
type StatusPropertyConfig = { defaultOptionId?: unknown; options?: unknown };

const statusOptionAliases: Record<string, string> = {
  complete: "done",
  completed: "done",
  done: "done",
  "in progress": "in-progress",
  inprogress: "in-progress",
  "not started": "not-started",
  "to-do": "not-started",
  todo: "not-started",
};

const normalizeOptionKey = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ");

const getNextSelectOptionColor = (index: number) =>
  selectOptionColors[index % selectOptionColors.length]!;

const resolveDefaultStatusOption = (
  id: string,
  name: string,
): (typeof defaultStatusOptions)[number] | null => {
  const byId = defaultStatusOptions.find((option) => option.id === id);
  if (byId) {
    return byId;
  }

  const aliasId =
    statusOptionAliases[normalizeOptionKey(id)] ??
    statusOptionAliases[normalizeOptionKey(name)];

  if (aliasId) {
    return defaultStatusOptions.find((option) => option.id === aliasId) ?? null;
  }

  return (
    defaultStatusOptions.find(
      (option) => normalizeOptionKey(option.name) === normalizeOptionKey(name),
    ) ?? null
  );
};

const normalizeSelectOption = (
  option: unknown,
  index: number,
  type: "select" | "multi_select" | "status",
): PropertySelectOption | null => {
  if (!option || typeof option !== "object") {
    return null;
  }

  const raw = option as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";

  if (!id || !name) {
    return null;
  }

  if (type === "status") {
    const defaultOption = resolveDefaultStatusOption(id, name);

    if (defaultOption) {
      return {
        id: defaultOption.id,
        name: defaultOption.name,
        color:
          typeof raw.color === "string" && raw.color.trim()
            ? raw.color.trim()
            : defaultOption.color,
        group:
          typeof raw.group === "string" && raw.group.trim()
            ? raw.group.trim()
            : defaultOption.group,
      };
    }

    return {
      id,
      name,
      color:
        typeof raw.color === "string" && raw.color.trim()
          ? raw.color.trim()
          : getNextSelectOptionColor(index),
      group:
        typeof raw.group === "string" && raw.group.trim()
          ? raw.group.trim()
          : "To-do",
    };
  }

  return {
    id,
    name,
    color:
      typeof raw.color === "string" && raw.color.trim()
        ? raw.color.trim()
        : getNextSelectOptionColor(index),
  };
};

export function normalizePropertyConfig(type: string, config: unknown) {
  const normalizedType = normalizeDatabasePropertyType(type);

  if (!normalizedType) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  if (normalizedType === "status") {
    const baseConfig =
      config && typeof config === "object"
        ? { ...(config as Record<string, unknown>) }
        : {};
    const rawOptions = baseConfig.options;

    if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
      return {
        ...baseConfig,
        defaultOptionId:
          typeof baseConfig.defaultOptionId === "string"
            ? baseConfig.defaultOptionId
            : defaultStatusOptions[0]?.id,
        options: [...defaultStatusOptions],
      };
    }

    const options = rawOptions
      .map((option, index) => normalizeSelectOption(option, index, "status"))
      .filter((option): option is PropertySelectOption => option !== null);

    return {
      ...baseConfig,
      defaultOptionId:
        typeof baseConfig.defaultOptionId === "string"
          ? baseConfig.defaultOptionId
          : (options[0]?.id ?? defaultStatusOptions[0]?.id),
      options,
    };
  }

  if (
    (normalizedType === "select" || normalizedType === "multi_select") &&
    config &&
    typeof config === "object" &&
    "options" in config &&
    Array.isArray((config as { options?: unknown }).options)
  ) {
    const options = (config as { options: unknown[] }).options
      .map((option, index) =>
        normalizeSelectOption(option, index, normalizedType),
      )
      .filter((option): option is PropertySelectOption => option !== null);

    return {
      ...(config as Record<string, unknown>),
      options,
    };
  }

  return config;
}

export function formatDatePropertyValueAsText(value: unknown) {
  let start: unknown;
  let end: unknown;

  if (Array.isArray(value)) {
    [start, end] = value;
  } else if (value && typeof value === "object") {
    const dateValue = value as {
      date?: unknown;
      end?: unknown;
      start?: unknown;
    };
    start = dateValue.start ?? dateValue.date;
    end = dateValue.end;
  } else {
    start = value;
  }

  const startText = typeof start === "string" ? start.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";

  if (startText && endText) {
    return `${startText} - ${endText}`;
  }

  return startText || null;
}

function getStatusOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as StatusPropertyConfig).options
      : null;

  if (!Array.isArray(options)) {
    return defaultStatusOptions;
  }

  const validOptions = options.filter(
    (option): option is StatusOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as StatusOption).id === "string" &&
      typeof (option as StatusOption).name === "string",
  );

  return validOptions.length > 0 ? validOptions : defaultStatusOptions;
}

export function getStatusDefaultValue(config: unknown) {
  const options = getStatusOptions(config);
  const defaultOptionId =
    config && typeof config === "object" && "defaultOptionId" in config
      ? (config as StatusPropertyConfig).defaultOptionId
      : defaultStatusOptions[0]?.id;

  if (typeof defaultOptionId === "string") {
    const defaultOption = options.find(
      (option) => option.id === defaultOptionId,
    );
    if (defaultOption) {
      return defaultOption.name;
    }
  }

  return options[0]?.name ?? null;
}

function readSelectOptionNames(config: unknown): Set<string> {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return new Set();
  }

  const options = (config as { options?: unknown }).options;

  if (!Array.isArray(options)) {
    return new Set();
  }

  return new Set(
    options.flatMap((option) => {
      if (!option || typeof option !== "object") {
        return [];
      }

      const name = (option as { name?: unknown }).name;
      return typeof name === "string" && name.length > 0 ? [name] : [];
    }),
  );
}

export function validateCellValue(
  propertyType: string,
  config: unknown,
  value: unknown,
) {
  const normalizedType = normalizeDatabasePropertyType(propertyType, "");

  if (!normalizedType) {
    throw new ServiceMutationError("Unsupported property type", 400);
  }

  if (isReadOnlyPropertyType(normalizedType)) {
    throw new ServiceMutationError("This property is read-only", 400);
  }

  if (
    normalizedType === "relation" &&
    config &&
    typeof config === "object" &&
    !Array.isArray(config)
  ) {
    const relationConfig = config as {
      relation?: { limit?: unknown };
      subItems?: { role?: unknown };
    };
    const isSinglePage =
      relationConfig.relation?.limit === "one_page" ||
      relationConfig.subItems?.role === "parent-item";
    const pageIds = Array.isArray(value)
      ? value.filter((pageId) => typeof pageId === "string" && pageId.length > 0)
      : [];

    if (isSinglePage && pageIds.length > 1) {
      throw new ServiceMutationError("Relation accepts only one page.", 400);
    }
  }

  if (isSelectLikePropertyType(normalizedType)) {
    const optionNames = readSelectOptionNames(config);

    if (normalizedType === "multi_select") {
      if (!Array.isArray(value)) {
        throw new ServiceMutationError(
          "multi_select values must be an array of option names.",
          400,
        );
      }

      for (const item of value) {
        if (typeof item !== "string" || !optionNames.has(item)) {
          throw new ServiceMutationError(
            `Invalid multi_select option. Configure options on the property first. Known options: ${[...optionNames].join(", ") || "(none)"}`,
            400,
          );
        }
      }

      return;
    }

    if (typeof value !== "string" || !optionNames.has(value)) {
      throw new ServiceMutationError(
        `Invalid select/status option name. Configure options on the property first. Known options: ${[...optionNames].join(", ") || "(none)"}`,
        400,
      );
    }
  }
}
