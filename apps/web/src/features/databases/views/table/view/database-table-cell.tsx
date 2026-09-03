import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Plus } from "@/shared/components/icons"
import {
  useDatabaseCellIsActive,
  useSetActiveDatabaseCell,
} from "../../model/database-cell-state"
import { useDatabaseRealtimeState } from "../../model/database-view-context"

export function DatabaseActiveTableCell({
  cellKey,
  children,
  className,
  isFillTarget,
  isSelected,
  onFillStart,
  onSelect,
  presenceKey,
  selectOnPointerDown,
  wrapContent,
}: {
  cellKey: string
  children: (setActive: (active: boolean) => void) => ReactNode
  className?: string
  isFillTarget?: boolean
  isSelected: boolean
  onFillStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSelect: () => void
  presenceKey: string
  selectOnPointerDown?: boolean
  wrapContent?: boolean
}) {
  const isActive = useDatabaseCellIsActive(cellKey)
  const setActiveCell = useSetActiveDatabaseCell()
  const { cellPresenceByKey } = useDatabaseRealtimeState()
  const presence = cellPresenceByKey[presenceKey] ?? []

  return (
    <td
      className={className}
      data-active={isActive ? "true" : undefined}
      data-fill-target={isFillTarget ? "true" : undefined}
      data-presence={presence.length > 0 ? "true" : undefined}
      data-selected={isSelected ? "true" : undefined}
      data-wrap-content={wrapContent ? "true" : undefined}
      onClick={onSelect}
      onPointerDownCapture={
        selectOnPointerDown
          ? (event) => {
              if (
                (event.target as Element).closest(
                  ".database-page-open, .database-sub-item-toggle"
                )
              ) {
                return
              }

              onSelect()
            }
          : undefined
      }
    >
      {presence.length > 0 ? (
        <div
          aria-hidden="true"
          className="database-cell-presence"
          title={presence.map((item) => item.user.name).join(", ")}
        >
          <span
            className="database-cell-presence-border"
            style={{
              "--database-presence-color": presence[0]?.color,
            } as CSSProperties}
          />
          <span className="database-cell-presence-stack">
            {presence.slice(0, 3).map((collaborator) => (
              <span
                className="database-cell-presence-dot"
                key={collaborator.sessionId}
                style={{
                  "--database-presence-color": collaborator.color,
                } as CSSProperties}
              />
            ))}
          </span>
        </div>
      ) : null}
      {children((active) => setActiveCell(active ? cellKey : null))}
      {isSelected && onFillStart ? (
        <button
          aria-label="Drag vertically to fill value"
          className="database-cell-fill-handle"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onFillStart}
          title="Drag vertically to fill value"
          type="button"
        />
      ) : null}
    </td>
  )
}

export function CreateDatabaseRowButton({
  columnCount,
  disabled,
  onClick,
}: {
  columnCount: number
  disabled: boolean
  onClick: () => void
}) {
  return (
    <tr
      className="database-table-create-row"
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
          <span>New page</span>
        </button>
      </td>
    </tr>
  )
}

