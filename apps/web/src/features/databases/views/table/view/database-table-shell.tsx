import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual"
import { getColorToken } from "@/shared/lib/color-tokens"
import { getDatabaseHorizontalScrollSync } from "../../../interactions/database-wheel-scroll"
import { isVerticalScrollContainer, shouldRenderVirtualizedDatabaseRows } from "../../controller/database-view-scroll"
import { useActiveDatabaseCellKey } from "../../model/database-cell-state"
import {
  ADD_PROPERTY_COLUMN_ID,
  getColumnWidth,
  getInsertPropertyColumnKey,
  type PendingInsertProperty,
  type TableRow,
} from "../model/database-table-model"

export function getTableColumnKeys({
  canEditStructure,
  columnIds,
  pendingInsert,
}: {
  canEditStructure: boolean
  columnIds: string[]
  pendingInsert: PendingInsertProperty | null
}) {
  const dataColumnKeys = columnIds.flatMap((columnId) => {
    if (!pendingInsert || columnId !== pendingInsert.sourceColumnKey) {
      return [columnId]
    }

    const insertKey = getInsertPropertyColumnKey(columnId, pendingInsert.side)

    return pendingInsert.side === "left"
      ? [insertKey, columnId]
      : [columnId, insertKey]
  })

  return [
    ...dataColumnKeys,
    ...(canEditStructure ? [ADD_PROPERTY_COLUMN_ID] : []),
  ]
}

export function getConditionalColorClassName(color?: string) {
  return color ? getColorToken(color).backgroundClass : undefined
}

export function getTableMinWidthStyle(tableMinWidth: number) {
  return {
    "--database-table-min-width": `${tableMinWidth}px`,
  } as CSSProperties
}

export function DatabaseTable({
  children,
  columnKeys,
  columnWidths,
  tableMinWidth,
}: {
  children: ReactNode
  columnKeys: string[]
  columnWidths: Record<string, number>
  tableMinWidth: number
}) {
  return (
    <table
      className="database-table"
      style={getTableMinWidthStyle(tableMinWidth)}
    >
      <colgroup>
        {columnKeys.map((key) => (
          <col
            data-column-id={key}
            key={key}
            style={key === ADD_PROPERTY_COLUMN_ID
              ? undefined
              : { width: getColumnWidth(columnWidths, key) }}
          />
        ))}
      </colgroup>
      {children}
    </table>
  )
}

export function DatabaseVirtualizedTable({
  columnKeys,
  columnWidths,
  footerRow,
  measurementKey,
  renderRow,
  rows,
  tableMinWidth,
  virtualizationEnabled,
}: {
  columnKeys: string[]
  columnWidths: Record<string, number>
  footerRow?: ReactNode
  measurementKey: string
  renderRow: (
    row: TableRow,
    index: number,
    measureElement: (node: Element | null) => void
  ) => ReactNode
  rows: TableRow[]
  tableMinWidth: number
  virtualizationEnabled: boolean
}) {
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const activeCellKey = useActiveDatabaseCellKey()
  const activeRowIndex = activeCellKey
    ? rows.findIndex((row) => activeCellKey.startsWith(`${row.pageId}:`))
    : -1
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)

      if (activeRowIndex < 0 || indexes.includes(activeRowIndex)) {
        return indexes
      }

      return [...indexes, activeRowIndex].sort((left, right) => left - right)
    },
    [activeRowIndex]
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 32,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 8,
    rangeExtractor,
    scrollMargin,
  })

  useLayoutEffect(() => {
    virtualizer.measure()
  }, [measurementKey, virtualizer])

  useLayoutEffect(() => {
    const element = tableRef.current

    if (!element) {
      return
    }

    let parent = element.parentElement
    let nextScrollElement: HTMLElement | null = null

    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY

      if (
        isVerticalScrollContainer({
          clientHeight: parent.clientHeight,
          overflowY,
          scrollHeight: parent.scrollHeight,
        })
      ) {
        nextScrollElement = parent
        break
      }

      parent = parent.parentElement
    }

    nextScrollElement ??= document.scrollingElement as HTMLElement | null
    setScrollElement(nextScrollElement)

    const measureOffset = () => {
      const elementRect = element.getBoundingClientRect()
      const scrollRect = nextScrollElement?.getBoundingClientRect()
      const scrollTop = nextScrollElement?.scrollTop ?? window.scrollY

      setScrollMargin(
        elementRect.top - (scrollRect?.top ?? 0) + scrollTop
      )
    }

    measureOffset()
    const observer = new ResizeObserver(measureOffset)
    observer.observe(element)
    if (nextScrollElement) {
      observer.observe(nextScrollElement)
    }
    window.addEventListener("resize", measureOffset)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measureOffset)
    }
  }, [])

  const virtualRows = virtualizer.getVirtualItems()
  const renderVirtualRows = shouldRenderVirtualizedDatabaseRows({
    hasScrollElement: scrollElement !== null,
    virtualRowCount: virtualRows.length,
    virtualizationEnabled,
  })
  const getLocalVirtualStart = (start: number) => start - scrollMargin
  const getLocalVirtualEnd = (end: number) => end - scrollMargin
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() -
        getLocalVirtualEnd(virtualRows[virtualRows.length - 1].end)
      : 0

  return (
    <div ref={tableRef}>
      <DatabaseTable
        columnKeys={columnKeys}
        columnWidths={columnWidths}
        tableMinWidth={tableMinWidth}
      >
        <tbody>
          {renderVirtualRows
            ? virtualRows.map((virtualRow, virtualIndex) => {
                const previousEnd =
                  virtualIndex === 0
                    ? 0
                    : getLocalVirtualEnd(virtualRows[virtualIndex - 1].end)
                const gap =
                  getLocalVirtualStart(virtualRow.start) - previousEnd

                return (
                  <Fragment key={virtualRow.key}>
                    {gap > 0 ? (
                      <tr aria-hidden="true">
                        <td
                          className="database-virtual-spacer"
                          colSpan={columnKeys.length}
                          style={{ height: gap }}
                        />
                      </tr>
                    ) : null}
                    {renderRow(
                      rows[virtualRow.index],
                      virtualRow.index,
                      virtualizer.measureElement
                    )}
                  </Fragment>
                )
              })
            : rows.map((row, index) =>
                renderRow(row, index, virtualizer.measureElement)
              )}
          {renderVirtualRows && paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td
                className="database-virtual-spacer"
                colSpan={columnKeys.length}
                style={{ height: paddingBottom }}
              />
            </tr>
          ) : null}
          {footerRow}
        </tbody>
      </DatabaseTable>
    </div>
  )
}

export function useSyncedHorizontalScroll(
  headerRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  syncVersion: unknown
) {
  useLayoutEffect(() => {
    const header = headerRef.current
    const body = bodyRef.current

    if (!header || !body) {
      return
    }

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      const syncState = getDatabaseHorizontalScrollSync(
        source,
        target.scrollLeft
      )

      source.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete source.dataset.databaseRubberBand

      if (syncState.isRubberBanding) {
        target.style.setProperty(
          "--database-horizontal-rubber-band-offset",
          `${syncState.rubberBandOffset}px`
        )
        target.dataset.databaseRubberBand = "true"
        return
      }

      target.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete target.dataset.databaseRubberBand

      if (target.scrollLeft !== syncState.scrollLeft) {
        target.scrollLeft = syncState.scrollLeft
      }
    }
    const syncHeaderToBody = () => syncScroll(body, header)
    const syncBodyToHeader = () => syncScroll(header, body)

    syncHeaderToBody()
    body.addEventListener("scroll", syncHeaderToBody, { passive: true })
    header.addEventListener("scroll", syncBodyToHeader, { passive: true })

    return () => {
      body.removeEventListener("scroll", syncHeaderToBody)
      header.removeEventListener("scroll", syncBodyToHeader)
      body.style.removeProperty("--database-horizontal-rubber-band-offset")
      header.style.removeProperty("--database-horizontal-rubber-band-offset")
      delete body.dataset.databaseRubberBand
      delete header.dataset.databaseRubberBand
    }
  }, [bodyRef, headerRef, syncVersion])
}

