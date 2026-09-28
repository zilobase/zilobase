import { useChangeDatabaseRow } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import type { KanbanMove } from "../model/database-kanban-moves";

/** Kanban describes a drop; the session controller owns state and persistence. */
export function useKanbanMoves(input: {
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
}) {
  const changeRow = useChangeDatabaseRow();
  return {
    isPending: changeRow.isPending,
    submitMove(move: KanbanMove) {
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
