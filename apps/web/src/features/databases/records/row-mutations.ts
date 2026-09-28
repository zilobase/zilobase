import type { NewRowSetup } from "./row-plans";
import type { DatabaseRowMutations } from "./mutation-adapters";

export function createAddDatabaseRowMutation({
  addRow,
  databaseId,
  editable,
  hostDatabaseId,
}: {
  addRow: DatabaseRowMutations["addRow"];
  databaseId: string | null | undefined;
  editable: boolean;
  hostDatabaseId?: string | null;
}) {
  return ({ parentRelation, propertyValues, title }: NewRowSetup) => {
    if (!editable || !databaseId) return;
    const values = new Map(propertyValues.map((value) => [value.propertyId, value]));
    addRow.mutate({
      databaseId,
      ...(hostDatabaseId ? { hostDatabaseId } : {}),
      ...(values.size ? { initialValues: [...values.values()] } : {}),
      title,
      ...(parentRelation
        ? {
            hierarchy: {
              parentRowId: parentRelation.parentRow.id,
              parentPropertyId: parentRelation.parentPropertyId,
              subItemPropertyId: parentRelation.subItemPropertyId,
            },
          }
        : {}),
    });
  };
}
