import type { DatabasePropertyType as DatabasePropertyTypeId } from "./property-types";
export type DatabasePropertyFilterKind =
  | "checkbox"
  | "date"
  | "files"
  | "number"
  | "person"
  | "text";
export type DatabasePropertyCellKind =
  | "button"
  | "checkbox"
  | "date"
  | "files"
  | "formula"
  | "input"
  | "person"
  | "read_only_time"
  | "relation"
  | "rollup"
  | "select"
  | "verification";
export type DatabasePropertyCapability = {
  cellKind?: DatabasePropertyCellKind;
  editable?: boolean;
  filterKind: DatabasePropertyFilterKind;
  hasEditSettings?: boolean;
  type: DatabasePropertyTypeId;
};
export const databasePropertyCapabilities: DatabasePropertyCapability[] = [
  { filterKind: "text", type: "text" },
  {
    filterKind: "number",
    hasEditSettings: true,
    type: "number",
  },
  {
    cellKind: "select",
    filterKind: "text",
    hasEditSettings: true,
    type: "select",
  },
  {
    cellKind: "select",
    filterKind: "text",
    hasEditSettings: true,
    type: "multi_select",
  },
  {
    cellKind: "select",
    filterKind: "text",
    hasEditSettings: true,
    type: "status",
  },
  {
    cellKind: "date",
    filterKind: "date",
    hasEditSettings: true,
    type: "date",
  },
  {
    cellKind: "person",
    filterKind: "person",
    hasEditSettings: true,
    type: "person",
  },
  {
    cellKind: "files",
    filterKind: "files",
    hasEditSettings: true,
    type: "files",
  },
  {
    cellKind: "checkbox",
    filterKind: "checkbox",
    type: "checkbox",
  },
  {
    filterKind: "text",
    hasEditSettings: true,
    type: "url",
  },
  { filterKind: "text", type: "phone" },
  { filterKind: "text", type: "email" },
  {
    cellKind: "relation",
    filterKind: "text",
    hasEditSettings: true,
    type: "relation",
  },
  {
    cellKind: "rollup",
    filterKind: "text",
    hasEditSettings: true,
    type: "rollup",
  },
  {
    cellKind: "formula",
    filterKind: "text",
    type: "formula",
  },
  {
    cellKind: "button",
    filterKind: "text",
    type: "button",
  },
  { filterKind: "text", type: "id" },
  { filterKind: "text", type: "place" },
  {
    cellKind: "verification",
    filterKind: "text",
    type: "verification",
  },
  {
    cellKind: "read_only_time",
    editable: false,
    filterKind: "date",
    hasEditSettings: true,
    type: "created_time",
  },
  {
    cellKind: "read_only_time",
    editable: false,
    filterKind: "date",
    hasEditSettings: true,
    type: "edited_time",
  },
];
export function getDatabasePropertyCapability(type: string) {
  return (
    databasePropertyCapabilities.find((item) => item.type === type) ??
    databasePropertyCapabilities[0]
  );
}
export function getDatabasePropertyFilterKind(type: string): DatabasePropertyFilterKind {
  return getDatabasePropertyCapability(type).filterKind;
}

export function getDatabasePropertyCellKind(type: string): DatabasePropertyCellKind {
  return getDatabasePropertyCapability(type).cellKind ?? "input";
}

export function hasDatabasePropertyTypeEditSettings(type: string) {
  return getDatabasePropertyCapability(type).hasEditSettings === true;
}

export function isDateLikePropertyType(type: string) {
  return getDatabasePropertyFilterKind(type) === "date";
}
