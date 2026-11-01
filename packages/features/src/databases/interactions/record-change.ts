import type { ChangeRowCommand } from "../core/entities";
import { buildRowChange } from "../mutations/command-builders";
import { changeRecordHierarchy } from "./hierarchy";
import type { RecordEffect } from "./model";
import type { DatabaseController } from "./store";
export type ChangeDatabaseRowInput = Omit<ChangeRowCommand, "type"> & {
  databaseId: string;
  dataSourceId: string;
};

export function submitRecordChange(store: DatabaseController, input: ChangeDatabaseRowInput) {
  const { databaseId, dataSourceId, ...change } = input;
  if (change.placement)
    change.placement = {
      afterRowId: change.placement.afterRowId,
      beforeRowId: change.placement.beforeRowId,
    };
  if (change.placement) {
    // A second gesture expresses the currently displayed destination, even if
    // the preceding move is subsequently rejected.
    for (const interaction of [...store.getSnapshot()].reverse()) {
      if (interaction.status === "committed") continue;
      for (const effect of interaction.effects) {
        if (effect.dataSourceId !== dataSourceId || effect.rowId !== input.rowId || effect.remove)
          continue;
        if (effect.values)
          change.valuesByPropertyId = { ...effect.values, ...change.valuesByPropertyId };
        if (change.title === undefined && effect.title !== undefined) change.title = effect.title;
      }
    }
  }
  const rows = store.records(dataSourceId);
  const record = rows.find(({ id }) => id === input.rowId);
  const effects: RecordEffect[] = [
    {
      dataSourceId,
      rowId: input.rowId,
      record,
      placement: change.placement,
      title: change.title,
      values: change.valuesByPropertyId,
      ...(input.hierarchy ? { parentRowId: input.hierarchy.parentRowId } : {}),
    },
  ];
  if (input.hierarchy) {
    for (const value of changeRecordHierarchy({
      ...input.hierarchy,
      rowId: input.rowId,
      rows,
      values: rows.flatMap(({ valuesByPropertyId }) => Object.values(valuesByPropertyId)),
    })) {
      effects.push({
        dataSourceId,
        rowId: value.rowId,
        values: { [value.propertyId]: value.value },
      });
    }
  }
  return store.submit(
    buildRowChange({ hostDatabaseId: databaseId, dataSourceId }, change),
    effects,
  );
}
