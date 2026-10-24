import { type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react";
import { useDataGrid } from "@/components/ui/data-grid/data-grid";
import { DataGridTableBodyRowCell } from "@/components/ui/data-grid/data-grid-table";
import type { DatabaseGridRow } from "../hooks/use-database-grid";
import { cn } from "@/lib/utils";
import { Plus } from "@/components/icons";
import {
  useDatabaseCellIsActive,
  useSetActiveDatabaseCell,
} from "../../state/components/database-cell-state";
import { useDatabaseRealtimeState } from "../../state/components/database-view-context";

export function DatabaseActiveTableCell({
  cellKey,
  children,
  className,
  rowId,
  columnId,
  presenceKey,
  wrapContent,
}: {
  cellKey: string;
  children: (setActive: (active: boolean) => void) => ReactNode;
  className?: string;
  rowId: string;
  columnId: string;
  presenceKey: string;
  wrapContent?: boolean;
}) {
  const isActive = useDatabaseCellIsActive(cellKey);
  const { table } = useDataGrid<DatabaseGridRow>();
  const cell = table.getRow(rowId).getAllCellsByColumnId()[columnId];
  const setActiveCell = useSetActiveDatabaseCell();
  const { cellPresenceByKey } = useDatabaseRealtimeState();
  const presence = cellPresenceByKey[presenceKey] ?? [];

  return (
    <DataGridTableBodyRowCell
      cell={cell}
      cellProps={{
        className: cn("p-0", className),
        "data-active": isActive ? "true" : undefined,
        "data-presence": presence.length > 0 ? "true" : undefined,
        "data-wrap-content": wrapContent ? "true" : undefined,
      }}
    >
      {presence.length > 0 ? (
        <div
          aria-hidden="true"
          className="database-cell-presence"
          title={presence.map((item) => item.user.name).join(", ")}
        >
          <span
            className="database-cell-presence-border"
            style={
              {
                "--database-presence-color": presence[0]?.color,
              } as CSSProperties
            }
          />
          <span className="database-cell-presence-stack">
            {presence.slice(0, 3).map((collaborator) => (
              <span
                className="database-cell-presence-dot"
                key={collaborator.sessionId}
                style={
                  {
                    "--database-presence-color": collaborator.color,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        </div>
      ) : null}
      {children((active) => setActiveCell(active ? cellKey : null))}
    </DataGridTableBodyRowCell>
  );
}

export function CreateDatabaseRowButton({
  label = "New page",
  columnCount,
  disabled,
  onClick,
  rowProps,
}: {
  label?: string;
  columnCount: number;
  disabled: boolean;
  onClick: () => void;
  rowProps?: ComponentPropsWithoutRef<"tr"> & Record<`data-${string}`, unknown>;
}) {
  return (
    <tr
      {...rowProps}
      className={cn("database-table-create-row", rowProps?.className)}
      data-database-row-drop-footer
    >
      <td colSpan={columnCount}>
        <button
          className="database-table-create"
          disabled={disabled}
          onClick={onClick}
          type="button"
        >
          <Plus />
          <span>{label}</span>
        </button>
      </td>
    </tr>
  );
}
