import type { DatabasePropertyValue } from "../../../schema/property-values";
import type { DatabasePropertyListItem, DatabaseSelectOption } from "./database-kanban-config";
import {
  getDerivedKanbanGroupId,
  getKanbanGroupLabel,
  getKanbanGroupValues,
  type DatabaseRow,
  type KanbanGroupOption,
} from "./database-kanban-group-model";

/** Build columns and membership once per board update, rather than per column render. */
export function buildKanbanBoard({
  groupProperty,
  items,
  options,
  personOptionsById,
  propertyValuesByKey,
  temporaryKanbanOptions,
}: {
  groupProperty: DatabasePropertyListItem | null;
  items: DatabaseRow[];
  options: DatabaseSelectOption[];
  personOptionsById: Map<string, string>;
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
  temporaryKanbanOptions: KanbanGroupOption[];
}) {
  if (!groupProperty) {
    return { options: [], rowsByGroupValue: new Map<string, DatabaseRow[]>() };
  }

  const nextOptions: KanbanGroupOption[] = [];
  const optionsByGroupValue = new Map<string, KanbanGroupOption>();
  const addOption = (option: KanbanGroupOption) => {
    if (optionsByGroupValue.has(option.groupValue)) {
      return;
    }

    optionsByGroupValue.set(option.groupValue, option);
    nextOptions.push(option);
  };

  if (groupProperty.property.type === "checkbox") {
    addOption({
      color: "green",
      groupValue: "true",
      id: "checkbox-true",
      name: "Checked",
    });
    addOption({
      color: "gray",
      groupValue: "false",
      id: "checkbox-false",
      name: "Unchecked",
    });
  } else {
    options.forEach((option) =>
      addOption({
        ...option,
        groupValue: option.name,
      }),
    );
  }

  temporaryKanbanOptions.forEach(addOption);

  let hasEmptyColumn = false;
  const rowsByGroupValue = new Map<string, DatabaseRow[]>();

  items.forEach((item: DatabaseRow) => {
    const groupValues = getKanbanGroupValues({
      property: groupProperty,
      propertyValuesByKey,
      row: item,
    });

    for (const value of new Set(groupValues.length ? groupValues : [""])) {
      const rows = rowsByGroupValue.get(value) ?? [];
      rows.push(item);
      rowsByGroupValue.set(value, rows);
    }

    if (groupValues.length === 0) {
      hasEmptyColumn = true;
      return;
    }

    groupValues.forEach((groupValue) => {
      addOption({
        groupValue,
        id: getDerivedKanbanGroupId(groupValue, groupProperty.property.type),
        name: getKanbanGroupLabel({
          groupValue,
          personOptionsById,
          property: groupProperty,
        }),
      });
    });
  });

  if (
    hasEmptyColumn &&
    groupProperty.property.type !== "status" &&
    groupProperty.property.type !== "checkbox"
  ) {
    addOption({
      color: "gray",
      groupValue: "",
      id: "empty",
      isEmpty: true,
      name: "Empty",
    });
  }

  return { options: nextOptions, rowsByGroupValue };
}
