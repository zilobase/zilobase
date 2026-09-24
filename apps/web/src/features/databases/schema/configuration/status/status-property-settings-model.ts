import { defaultStatusOptions } from "../../model/property-defaults";

import type { DatabaseSelectOption } from "../../../views/model/database-view-config";

export type StatusOption = DatabaseSelectOption & {
  group?: string;
};

export const statusOptionGroupNames = [
  "Backlog",
  "To-do",
  "In progress",
  "Review",
  "Complete",
] as const;

export function getStatusOptionGroups(options: StatusOption[]) {
  return statusOptionGroupNames.map((name) => ({
    name,
    options: options.filter(
      (option) => getStatusOptionGroup(option) === name,
    ),
  }));
}

export function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find(
      (defaultOption) => defaultOption.name === option.name,
    )?.group ??
    "To-do"
  );
}
