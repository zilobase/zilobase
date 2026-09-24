export type KanbanGroupSettings = {
  hiddenGroupIds: string[];
  hiddenCountGroupIds: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getKanbanGroupSettings(config: unknown, propertyId: string): KanbanGroupSettings {
  const settings = record(record(record(config).kanbanGroups)[propertyId]);
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    hiddenGroupIds: strings(settings.hiddenGroupIds),
    hiddenCountGroupIds: strings(settings.hiddenCountGroupIds),
  };
}

export function updateKanbanGroupSettings(
  config: unknown,
  propertyId: string,
  patch: Partial<KanbanGroupSettings>,
) {
  return {
    ...record(config),
    kanbanGroups: {
      ...record(record(config).kanbanGroups),
      [propertyId]: { ...getKanbanGroupSettings(config, propertyId), ...patch },
    },
  };
}

export function getKanbanGroupPageIds<Row extends { pageId: string }>(
  rows: Row[],
  groupValue: string,
  getValues: (row: Row) => string[],
) {
  return [
    ...new Set(
      rows
        .filter((row) => {
          const values = getValues(row);
          return groupValue === "" ? values.length === 0 : values.includes(groupValue);
        })
        .map((row) => row.pageId),
    ),
  ];
}
