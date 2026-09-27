import { useEffect, useMemo, useRef, useState } from "react";
import { useMoveDatabaseRow } from "@zilobase/features/databases/react";
import { useUpdatePage } from "@zilobase/features/pages/react";
import { toast } from "sonner";
import type { DatabasePropertyValue } from "../../../schema/property-values";
import { markDatabaseInteractionPaint } from "../../../metrics";
import {
  getPendingKanbanMoves,
  inheritKanbanMoveGroup,
  projectKanbanMoves,
  type KanbanMove,
  type KanbanMoveDraft,
  type KanbanMoveRow,
} from "../model/database-kanban-moves";

/** Local editor drafts; the QueryClient window remains the server projection. */
export function useKanbanMoves<Row extends KanbanMoveRow>(input: {
  databaseId: string | null | undefined;
  hostDatabaseId: string | null | undefined;
  windowVersion: number | null | undefined;
  rows: Row[];
  visibleRows: Row[];
  propertyValuesByKey: Record<string, DatabasePropertyValue>;
}) {
  const moveRow = useMoveDatabaseRow();
  const updatePage = useUpdatePage();
  const [drafts, setDrafts] = useState<KanbanMoveDraft<Row>[]>([]);
  const nextId = useRef(0);
  // Include title-group renames in the same sequence as their row moves.
  const tail = useRef(Promise.resolve());
  const pending = useMemo(
    () => getPendingKanbanMoves(drafts, input.windowVersion),
    [drafts, input.windowVersion],
  );
  useEffect(() => {
    if (pending.length !== drafts.length) {
      setDrafts((current) => getPendingKanbanMoves(current, input.windowVersion));
    }
  }, [drafts, pending, input.windowVersion]);
  const projection = useMemo(
    () => projectKanbanMoves(input.rows, input.propertyValuesByKey, pending),
    [input.rows, input.propertyValuesByKey, pending],
  );
  const visibleProjection = useMemo(
    () => projectKanbanMoves(input.visibleRows, input.propertyValuesByKey, pending),
    [input.visibleRows, input.propertyValuesByKey, pending],
  );

  const submitMove = (intention: KanbanMove) => {
    const move = inheritKanbanMoveGroup(intention, pending);
    const databaseId = input.databaseId;
    const row = projection.rows.find(({ id }) => id === move.rowId);
    if (!databaseId || !row) return;
    const id = ++nextId.current;
    const startedAt = performance.now();
    setDrafts((current) => [...current, { id, row, move, committedVersion: null }]);
    markDatabaseInteractionPaint(startedAt);
    const save = async () => {
      try {
        if (move.pageTitle !== undefined) {
          await updatePage.mutateAsync({ id: move.pageId, name: move.pageTitle });
        }
        await moveRow.mutateAsync({
          databaseId,
          ...(input.hostDatabaseId ? { hostDatabaseId: input.hostDatabaseId } : {}),
          rowId: move.rowId,
          afterRowId: move.afterRowId,
          beforeRowId: move.beforeRowId,
          ...(move.group
            ? { groupPropertyId: move.group.propertyId, groupValue: move.group.serializedValue }
            : {}),
          optimistic: false,
          onCommitted: (committedVersion) => {
            setDrafts((current) =>
              current.map((draft) => (draft.id === id ? { ...draft, committedVersion } : draft)),
            );
          },
        });
      } catch (error) {
        // Remove only this intention; newer moves and unrelated data survive.
        setDrafts((current) => current.filter((draft) => draft.id !== id));
        toast.error(error instanceof Error ? error.message : "Couldn't move card");
      }
    };
    tail.current = tail.current.then(save, save);
  };

  return {
    ...projection,
    visibleRows: visibleProjection.rows,
    submitMove,
    isPending: pending.length > 0,
  };
}
