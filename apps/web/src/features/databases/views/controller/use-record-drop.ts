import { useChangeDatabaseRow } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import type { RecordDrop } from "../model/database-record-drop";

/** A renderer describes a drop; the session controller owns state and persistence. */
export function useRecordDrops(input: {
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
}) {
  const changeRow = useChangeDatabaseRow();
  return {
    isPending: changeRow.isPending,
    submitMove(move: RecordDrop) {
      if (!input.databaseId || !input.hostDatabaseId) return;
      changeRow.mutate(
        {
          databaseId: input.hostDatabaseId,
          dataSourceId: input.databaseId,
          rowId: move.rowId,
          placement: { afterRowId: move.afterRowId, beforeRowId: move.beforeRowId },
          ...(move.pageTitle !== undefined ? { title: move.pageTitle } : {}),
          ...(move.group
            ? { valuesByPropertyId: { [move.group.propertyId]: move.group.serializedValue } }
            : {}),
        },
        { onError: (error) => toast.error(error.message) },
      );
    },
  };
}
