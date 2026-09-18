import {
  isDatabaseFilterGroup,
  normalizeDatabaseFilters,
  type DatabaseFilterItemConfig,
} from "../schema/filter";

export type DatabaseViewQuerySort = {
  column: string;
  direction: "ascending" | "descending";
};

export type DatabaseViewQuery = {
  filters: DatabaseFilterItemConfig[];
  includeDeleted: boolean;
  sorts: DatabaseViewQuerySort[];
};

function readViewSorts(config: unknown): DatabaseViewQuerySort[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const sorts = (config as { sorts?: unknown }).sorts;
  if (!Array.isArray(sorts)) return [];
  return sorts.flatMap((sort) => {
    if (!sort || typeof sort !== "object" || Array.isArray(sort)) return [];
    const candidate = sort as { column?: unknown; direction?: unknown };
    return typeof candidate.column === "string" &&
        (candidate.direction === "ascending" ||
          candidate.direction === "descending")
      ? [{ column: candidate.column, direction: candidate.direction }]
      : [];
  });
}

function stripFilterIds(
  filters: DatabaseFilterItemConfig[],
): DatabaseFilterItemConfig[] {
  return filters.map((filter) => {
    if (isDatabaseFilterGroup(filter)) {
      const group: DatabaseFilterItemConfig = {
        filters: stripFilterIds(filter.filters),
        id: "",
        operator: filter.operator,
        type: "group",
      };
      if (filter.joinOperator !== undefined) {
        group.joinOperator = filter.joinOperator;
      }
      return group;
    }
    const item: DatabaseFilterItemConfig = {
      id: "",
      operator: filter.operator,
      propertyId: filter.propertyId,
      values: [...filter.values],
    };
    if (filter.joinOperator !== undefined) {
      item.joinOperator = filter.joinOperator;
    }
    return item;
  });
}

/**
 * The data-affecting slice of a view config: filters, sorts, and the
 * deleted-rows flag. Presentation (view type, grouping, hidden properties,
 * layout, colors) is intentionally excluded so views that differ only in
 * presentation share one record query.
 */
export function normalizeDatabaseViewQuery(
  config: unknown,
  includeDeleted = false,
): DatabaseViewQuery {
  const rawFilters = config && typeof config === "object" &&
      !Array.isArray(config) &&
      Array.isArray((config as { filters?: unknown }).filters)
    ? (config as { filters: unknown[] }).filters
    : [];
  return {
    filters: stripFilterIds(normalizeDatabaseFilters(rawFilters)),
    includeDeleted: includeDeleted === true,
    sorts: readViewSorts(config),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** cyrb53: deterministic, dependency-free, runtime-agnostic (client + server). */
function hash53(input: string, seed = 0): string {
  let high = 0xdeadbeef ^ seed;
  let low = 0x41c6ce57 ^ seed;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charCodeAt(index);
    high = Math.imul(high ^ char, 2654435761);
    low = Math.imul(low ^ char, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^
    Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^
    Math.imul(high ^ (high >>> 13), 3266489909);
  return (4294967296 * (2097151 & low) + (high >>> 0)).toString(16);
}

/**
 * Cache identity for a view's record set. Equal hashes mean the server
 * evaluates the same rows in the same order, so the cached window can be
 * reused without a fetch regardless of view type or other presentation.
 */
export function databaseViewQueryHash(
  config: unknown,
  includeDeleted = false,
): string {
  return `q${hash53(stableStringify(normalizeDatabaseViewQuery(config, includeDeleted)))}`;
}
