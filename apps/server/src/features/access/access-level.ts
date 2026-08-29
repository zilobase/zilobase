export type AccessLevel = "none" | "view" | "comment" | "edit" | "full";

export const accessRank: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  comment: 2,
  edit: 3,
  full: 4,
};

export function hasAccess(
  actual: AccessLevel,
  required: Exclude<AccessLevel, "none">,
) {
  return accessRank[actual] >= accessRank[required];
}

export function normalizeAccessLevel(value: unknown): AccessLevel | null {
  return value === "view" ||
    value === "comment" ||
    value === "edit" ||
    value === "full"
    ? value
    : null;
}

export function maxAccess(first: AccessLevel, second: AccessLevel): AccessLevel {
  return accessRank[first] >= accessRank[second] ? first : second;
}
