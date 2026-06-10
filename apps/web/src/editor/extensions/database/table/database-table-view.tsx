import { Link } from "@tanstack/react-router"
import {
  ArrowDownUp,
  FileText,
  GripVertical,
  Loader2,
  Maximize2,
  Plus,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSession } from "@notelab/features/auth"
import {
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  useReorderDatabaseRows,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@notelab/features/databases"
import { useWorkspacePersonAccessTargets } from "@notelab/features/workspaces"

import { AddDatabasePropertyMenu } from "./add-database-property-menu"
import {
  DATABASE_PAGE_DRAG_MIME,
  databaseAddPropertyColumnDefaultWidth,
  databaseColumnMinWidth,
  databaseNameColumnDefaultWidth,
  defaultStatusOptions,
  getDatabasePropertyType,
} from "../constants"
import { DatabaseInputCell } from "./database-input-cell"
import { DatabaseDateCell } from "./database-date-cell"
import { DatabasePageCell } from "./database-page-cell"
import {
  getDatabaseSorts,
  getMergedDatabaseConfig,
  getNameColumnLabel,
  getNameColumnShowPageIcon,
  getNameColumnWrapContent,
  getPersonLimit,
  getPropertyWrapContent,
  type DatabaseSortConfig,
  type DatabaseSortDirection,
} from "./database-column-config"
import {
  DatabaseNamePropertyMenu,
  DatabasePropertyMenu,
} from "./database-property-menu"
import { NameColumnGlyph } from "./name-column-glyph"
import { DatabaseSelectCell } from "./database-select-cell"
import { DatabaseViewSettingsMenu } from "./database-view-settings-menu"
import {
  getPropertyValue,
  serializePropertyValue,
  type DatabasePropertyValue,
} from "../utils"

type RowDragOverlay = {
  height: number
  left: number
  offsetX: number
  offsetY: number
  title: string
  top: number
  width: number
}

type InsertPropertySide = "left" | "right"

type PendingInsertProperty = {
  position: number
  side: InsertPropertySide
  sourceColumnKey: string
}

type DatabasePageDragPayload = {
  databaseId?: string
  pageId: string
  rowId?: string
  title?: string
}

function getDatabasePageDragPayload(
  dataTransfer: DataTransfer | null
): DatabasePageDragPayload | null {
  const payload = dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as {
      databaseId?: unknown
      pageId?: unknown
      rowId?: unknown
      title?: unknown
    }

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null
    }

    return {
      databaseId:
        typeof parsed.databaseId === "string" ? parsed.databaseId : undefined,
      pageId: parsed.pageId,
      rowId: typeof parsed.rowId === "string" ? parsed.rowId : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    }
  } catch {
    return null
  }
}

function hasDatabasePageDragPayload(dataTransfer: DataTransfer | null) {
  return Array.from(dataTransfer?.types ?? []).includes(DATABASE_PAGE_DRAG_MIME)
}

function hideNativeDragPreview(dataTransfer: DataTransfer) {
  const dragImage = document.createElement("span")

  dragImage.style.position = "fixed"
  dragImage.style.top = "-100px"
  dragImage.style.left = "-100px"
  dragImage.style.width = "1px"
  dragImage.style.height = "1px"
  dragImage.style.opacity = "0"

  document.body.appendChild(dragImage)
  dataTransfer.setDragImage(dragImage, 0, 0)
  window.requestAnimationFrame(() => dragImage.remove())
}

function handleDatabaseCellWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const horizontalDelta =
    Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0

  if (!horizontalDelta) {
    return
  }

  const scrollElement = event.currentTarget
  const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth
  const tableScrollElement = scrollElement.closest<HTMLDivElement>(
    ".database-table-scroll"
  )

  const scrollTable = (delta: number) => {
    if (!tableScrollElement) {
      return false
    }

    const tableMaxScrollLeft =
      tableScrollElement.scrollWidth - tableScrollElement.clientWidth
    const nextScrollLeft = Math.min(
      tableMaxScrollLeft,
      Math.max(0, tableScrollElement.scrollLeft + delta)
    )

    if (nextScrollLeft === tableScrollElement.scrollLeft) {
      return false
    }

    tableScrollElement.scrollLeft = nextScrollLeft
    return true
  }

  if (maxScrollLeft <= 1) {
    if (scrollTable(horizontalDelta)) {
      event.preventDefault()
      event.stopPropagation()
    }

    return
  }

  const previousScrollLeft = scrollElement.scrollLeft
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, previousScrollLeft + horizontalDelta)
  )
  const consumedDelta = nextScrollLeft - previousScrollLeft
  const remainingDelta = horizontalDelta - consumedDelta

  scrollElement.scrollLeft = nextScrollLeft

  if (remainingDelta) {
    scrollTable(remainingDelta)
  }

  event.preventDefault()
  event.stopPropagation()
}

function DatabaseCellContent({
  children,
  wrapContent = false,
}: {
  children: ReactNode
  wrapContent?: boolean
}) {
  return (
    <div
      className="database-cell-scroll"
      data-database-cell-scroll
      data-wrap-content={wrapContent ? "true" : "false"}
      onWheel={handleDatabaseCellWheel}
    >
      {children}
    </div>
  )
}

function isReadOnlyTimeProperty(type: string) {
  return type === "created_time" || type === "last_edited_time"
}

function getReadOnlyTimePropertyValue(
  row: {
    createdAt: string
    page: {
      createdAt?: string
      updatedAt?: string
    }
    updatedAt: string
  },
  type: string
) {
  const value =
    type === "created_time"
      ? row.page.createdAt ?? row.createdAt
      : row.page.updatedAt ?? row.updatedAt

  return formatTimestamp(value)
}

function getReadOnlyTimePropertySortValue(
  row: {
    createdAt: string
    page: {
      createdAt?: string
      updatedAt?: string
    }
    updatedAt: string
  },
  type: string
) {
  return type === "created_time"
    ? row.page.createdAt ?? row.createdAt
    : row.page.updatedAt ?? row.updatedAt
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return ""
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function isEmptySortValue(value: number | string | null) {
  return value === null || value === ""
}

function compareSortValues(
  firstValue: number | string | null,
  secondValue: number | string | null,
  direction: DatabaseSortDirection
) {
  const firstIsEmpty = isEmptySortValue(firstValue)
  const secondIsEmpty = isEmptySortValue(secondValue)

  if (firstIsEmpty || secondIsEmpty) {
    if (firstIsEmpty && secondIsEmpty) {
      return 0
    }

    return firstIsEmpty ? 1 : -1
  }

  let comparison = 0

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    comparison = firstValue - secondValue
  } else {
    comparison = String(firstValue).localeCompare(String(secondValue), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }

  return direction === "descending" ? comparison * -1 : comparison
}

function getComparableDateValue(
  value: DatabasePropertyValue | string | null | undefined
) {
  const rawValue = Array.isArray(value) ? value[0] ?? "" : value
  const timestamp = rawValue ? new Date(rawValue).getTime() : Number.NaN

  return Number.isFinite(timestamp) ? timestamp : null
}

function getComparableNumberValue(value: DatabasePropertyValue) {
  const rawValue = Array.isArray(value) ? value[0] ?? "" : value
  const parsedValue = rawValue.trim() ? Number(rawValue) : Number.NaN

  return Number.isFinite(parsedValue) ? parsedValue : null
}

function getComparablePersonValue(
  value: DatabasePropertyValue,
  personOptionsById: Map<string, string>
) {
  const personIds = Array.isArray(value) ? value : value ? [value] : []

  return personIds
    .map((personId) => personOptionsById.get(personId) ?? personId)
    .join(", ")
}

function getComparablePropertyValue(
  row: {
    createdAt: string
    page: {
      name: string
      createdAt?: string
      updatedAt?: string
    }
    pageId: string
    updatedAt: string
  },
  property: {
    property: {
      id: string
      type: string
    }
  },
  cellValues: Record<string, DatabasePropertyValue>,
  personOptionsById: Map<string, string>
) {
  const propertyValue = cellValues[`${row.pageId}:${property.property.id}`] ?? ""

  switch (property.property.type) {
    case "checkbox":
      return propertyValue === "true" ? 1 : 0
    case "created_time":
    case "last_edited_time":
      return getComparableDateValue(
        getReadOnlyTimePropertySortValue(row, property.property.type)
      )
    case "date":
      return getComparableDateValue(propertyValue)
    case "number":
      return getComparableNumberValue(propertyValue)
    case "person":
      return getComparablePersonValue(propertyValue, personOptionsById)
    default:
      return Array.isArray(propertyValue) ? propertyValue.join(", ") : propertyValue
  }
}

function getSortedRows(
  rows: {
    createdAt: string
    id: string
    page: {
      name: string
      createdAt?: string
      updatedAt?: string
    }
    pageId: string
    position: number
    updatedAt: string
  }[],
  properties: {
    id: string
    property: {
      id: string
      type: string
    }
  }[],
  cellValues: Record<string, DatabasePropertyValue>,
  sorts: DatabaseSortConfig[],
  personOptionsById: Map<string, string>
) {
  if (sorts.length === 0) {
    return rows
  }

  return [...rows].sort((firstRow, secondRow) => {
    for (const sort of sorts) {
      const comparison =
        sort.column === "name"
          ? compareSortValues(
              firstRow.page.name.trim(),
              secondRow.page.name.trim(),
              sort.direction
            )
          : (() => {
              const sortedProperty = properties.find(
                (property) => property.id === sort.column
              )

              if (!sortedProperty) {
                return 0
              }

              return compareSortValues(
                getComparablePropertyValue(
                  firstRow,
                  sortedProperty,
                  cellValues,
                  personOptionsById
                ),
                getComparablePropertyValue(
                  secondRow,
                  sortedProperty,
                  cellValues,
                  personOptionsById
                ),
                sort.direction
              )
            })()

      if (comparison !== 0) {
        return comparison
      }
    }

    return firstRow.position - secondRow.position
  })
}

type DatabaseSortOption = {
  icon: ReactNode
  label: string
  value: string
}

function areSerializedPropertyValuesEqual(
  propertyType: string,
  currentValue: DatabasePropertyValue,
  nextValue: DatabasePropertyValue
) {
  return (
    JSON.stringify(serializePropertyValue(propertyType, currentValue)) ===
    JSON.stringify(serializePropertyValue(propertyType, nextValue))
  )
}

type DatabaseTableViewProps = {
  databaseId: string | null | undefined
  editable?: boolean
  fullPage?: boolean
  onOpenPage?: (pageId: string) => void
  organizationId?: string | null
  showExpandButton?: boolean
  showTitle?: boolean
}

export function DatabaseTableView({
  databaseId,
  editable = true,
  fullPage = false,
  onOpenPage,
  organizationId,
  showExpandButton = false,
  showTitle = true,
}: DatabaseTableViewProps) {
  const [draftCells, setDraftCells] = useState<Record<string, string>>({})
  const updateDatabase = useUpdateDatabase()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow(organizationId)
  const reorderRows = useReorderDatabaseRows()
  const updateValue = useUpdateDatabasePropertyValue()
  const { data: payload, isLoading } = useDatabase(databaseId)
  const { data: session } = useSession()
  const { data: accessTargets } = useWorkspacePersonAccessTargets(
    payload?.database.pageId
  )
  const [draftTitle, setDraftTitle] = useState("New database")
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [rowDragOverlay, setRowDragOverlay] =
    useState<RowDragOverlay | null>(null)
  const [rowDropTargetIndex, setRowDropTargetIndex] = useState<number | null>(
    null
  )
  const [pendingInsertProperty, setPendingInsertProperty] =
    useState<PendingInsertProperty | null>(null)
  const [showSortPill, setShowSortPill] = useState(true)
  const [sortPickerQuery, setSortPickerQuery] = useState("")
  const [sortPickerOpen, setSortPickerOpen] = useState(false)
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false)
  const [addSortPickerQuery, setAddSortPickerQuery] = useState("")
  const [addSortPickerOpen, setAddSortPickerOpen] = useState(false)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [rowLayout, setRowLayout] = useState<{
    centers: Record<string, number>
    dropTops: number[]
  }>({ centers: {}, dropTops: [] })

  const propertyValues = payload?.values ?? []
  const properties = payload?.properties ?? []
  const rows = payload?.rows ?? []
  const personOptions = useMemo(
    () =>
      (accessTargets?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name || member.email,
        suffix: member.id === session?.user?.id ? "(you)" : undefined,
      })),
    [accessTargets?.members, session?.user?.id]
  )
  const personOptionsById = useMemo(
    () =>
      new Map(
        personOptions.map((personOption) => [personOption.id, personOption.name])
      ),
    [personOptions]
  )
  const nameColumnLabel = getNameColumnLabel(payload?.database.config)
  const nameColumnWrapContent = getNameColumnWrapContent(payload?.database.config)
  const nameColumnShowPageIcon = getNameColumnShowPageIcon(
    payload?.database.config
  )
  const sortColumnOptions = useMemo<DatabaseSortOption[]>(
    () => [
      {
        icon: <NameColumnGlyph />,
        label: nameColumnLabel,
        value: "name",
      },
      ...properties.map((property) => {
        const PropertyIcon = getDatabasePropertyType(property.property.type).icon

        return {
          icon: <PropertyIcon />,
          label: property.property.name,
          value: property.id,
        }
      }),
    ],
    [nameColumnLabel, properties]
  )
  const databaseSorts = useMemo(
    () => getDatabaseSorts(payload?.database.config),
    [payload?.database.config]
  )
  const activeDatabaseSorts = useMemo(
    () =>
      databaseSorts.flatMap((sort) => {
        const option = sortColumnOptions.find(
          (sortOption) => sortOption.value === sort.column
        )

        return option
          ? [
              {
                ...sort,
                label: option.label,
              },
            ]
          : []
      }),
    [databaseSorts, sortColumnOptions]
  )
  const isTableSorted = activeDatabaseSorts.length > 0
  const visiblePropertyCount = properties.length + 1
  const usedSortColumnValues = useMemo(
    () => new Set(activeDatabaseSorts.map((sort) => sort.column)),
    [activeDatabaseSorts]
  )
  const filteredSortColumnOptions = useMemo(() => {
    const normalizedQuery = sortPickerQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return sortColumnOptions
    }

    return sortColumnOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery)
    )
  }, [sortColumnOptions, sortPickerQuery])
  const addableSortColumnOptions = useMemo(
    () =>
      sortColumnOptions.filter((option) => !usedSortColumnValues.has(option.value)),
    [sortColumnOptions, usedSortColumnValues]
  )
  const filteredAddableSortColumnOptions = useMemo(() => {
    const normalizedQuery = addSortPickerQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return addableSortColumnOptions
    }

    return addableSortColumnOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery)
    )
  }, [addSortPickerQuery, addableSortColumnOptions])
  const canAddDatabaseSort = activeDatabaseSorts.length < sortColumnOptions.length
  const pendingInsertPropertyKey = pendingInsertProperty
    ? `insert-property-${pendingInsertProperty.sourceColumnKey}-${pendingInsertProperty.side}`
    : null
  const columnKeys = useMemo(() => {
    const nameKeys =
      pendingInsertProperty?.sourceColumnKey === "name"
        ? pendingInsertProperty.side === "left"
          ? ["insert-property-name-left", "name"]
          : ["name", "insert-property-name-right"]
        : ["name"]
    const propertyKeys = properties.flatMap((property) => {
      if (property.id !== pendingInsertProperty?.sourceColumnKey) {
        return [property.id]
      }

      const insertKey = `insert-property-${property.id}-${pendingInsertProperty.side}`

      return pendingInsertProperty.side === "left"
        ? [insertKey, property.id]
        : [property.id, insertKey]
    })

    return [...nameKeys, ...propertyKeys, ...(editable ? ["add-property"] : [])]
  }, [editable, pendingInsertProperty, properties])
  const getColumnWidth = (key: string) =>
    columnWidths[key] ??
    (key === "name"
      ? databaseNameColumnDefaultWidth
      : key === "add-property"
        ? databaseAddPropertyColumnDefaultWidth
        : key.startsWith("insert-property-")
          ? databaseAddPropertyColumnDefaultWidth
          : databaseColumnMinWidth)
  const tableMinWidth = columnKeys.reduce(
    (width, key) => width + getColumnWidth(key),
    0
  )

  useEffect(() => {
    if (payload?.database.name) {
      setDraftTitle(payload.database.name)
    }
  }, [payload?.database.id, payload?.database.name])

  useEffect(() => {
    if (activeDatabaseSorts.length === 0) {
      setShowSortPill(false)
      setAddSortPickerOpen(false)
      setSortPopoverOpen(false)
    }
  }, [activeDatabaseSorts.length])

  const getRowElements = useCallback(() => {
    return Array.from(
      tableWrapRef.current?.querySelectorAll<HTMLTableRowElement>(
        ".database-table tbody tr[data-database-row-id]"
      ) ?? []
    )
  }, [])

  const measureRows = useCallback(() => {
    const wrapperElement = tableWrapRef.current

    if (!wrapperElement) {
      return { centers: {}, dropTops: [] }
    }

    const wrapperRect = wrapperElement.getBoundingClientRect()
    const rowElements = getRowElements()
    const centers: Record<string, number> = {}
    const dropTops: number[] = []

    rowElements.forEach((rowElement, index) => {
      const rect = rowElement.getBoundingClientRect()
      const top = rect.top - wrapperRect.top
      const height = rect.height
      const rowId = rowElement.dataset.databaseRowId

      if (rowId) {
        centers[rowId] = top + height / 2
      }

      dropTops[index] = top

      if (index === rowElements.length - 1) {
        dropTops[index + 1] = top + height
      }
    })

    setRowLayout({ centers, dropTops })

    return { centers, dropTops }
  }, [getRowElements])

  useEffect(() => {
    if (
      pendingInsertProperty &&
      pendingInsertProperty.sourceColumnKey !== "name" &&
      !properties.some(
        (property) => property.id === pendingInsertProperty.sourceColumnKey
      )
    ) {
      setPendingInsertProperty(null)
    }
  }, [pendingInsertProperty, properties])

  useEffect(() => {
    window.addEventListener("resize", measureRows)

    return () => window.removeEventListener("resize", measureRows)
  }, [measureRows])

  const isDraggingDatabaseRow = Boolean(rowDragOverlay)

  useEffect(() => {
    if (!isDraggingDatabaseRow) {
      return
    }

    const moveOverlay = (event: DragEvent) => {
      setRowDragOverlay((overlay) =>
        overlay
          ? {
              ...overlay,
              left: event.clientX - overlay.offsetX,
              top: event.clientY - overlay.offsetY,
            }
          : overlay
      )
    }

    window.addEventListener("dragover", moveOverlay)

    return () => window.removeEventListener("dragover", moveOverlay)
  }, [isDraggingDatabaseRow])

  const cellValues = useMemo(() => {
    const values: Record<string, DatabasePropertyValue> = {}

    for (const row of rows) {
      for (const property of properties) {
        values[`${row.pageId}:${property.property.id}`] = getPropertyValue(
          propertyValues,
          row.pageId,
          property.property.id,
          property.property.type
        )
      }
    }

    return values
  }, [properties, propertyValues, rows])
  const sortedRows = useMemo(
    () =>
      getSortedRows(
        rows,
        properties,
        cellValues,
        activeDatabaseSorts,
        personOptionsById
      ),
    [activeDatabaseSorts, cellValues, personOptionsById, properties, rows]
  )

  useLayoutEffect(() => {
    measureRows()
  }, [activeCellKey, measureRows, properties, sortedRows])

  const addDatabaseRow = () => {
    if (!editable || !databaseId || addRow.isPending) {
      return
    }

    addRow.mutate({
      databaseId,
      title: "Untitled",
    })
  }

  const addDatabaseProperty = (
    type = "text",
    label = "Property",
    position?: number
  ) => {
    if (!editable || !databaseId || addProperty.isPending) {
      return
    }

    addProperty.mutate({
      config:
        type === "status"
          ? {
              defaultOptionId: defaultStatusOptions[0]?.id,
              options: defaultStatusOptions,
            }
          : undefined,
      databaseId,
      name: label,
      position,
      type,
    })
  }
  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    if (!databaseId) {
      return
    }

    updateDatabase.mutate({
      config: getMergedDatabaseConfig(payload?.database.config, {
        sort: undefined,
        sorts: nextSorts.length > 0 ? nextSorts : undefined,
      }),
      databaseId,
    })
  }
  const createDatabaseSort = (column: string) => {
    saveDatabaseSorts([
      ...activeDatabaseSorts.map(({ column, direction }) => ({
        column,
        direction,
      })),
      {
        column,
        direction: "ascending",
      },
    ])
    setShowSortPill(true)
    setAddSortPickerOpen(false)
    setAddSortPickerQuery("")
    setSortPickerQuery("")
    setSortPickerOpen(false)
  }
  const updateDatabaseSort = (
    index: number,
    patch: Partial<DatabaseSortConfig>
  ) => {
    saveDatabaseSorts(
      activeDatabaseSorts.map(({ column, direction }, sortIndex) =>
        sortIndex === index ? { column, direction, ...patch } : { column, direction }
      )
    )
  }
  const removeDatabaseSort = (index: number) => {
    saveDatabaseSorts(
      activeDatabaseSorts.flatMap(({ column, direction }, sortIndex) =>
        sortIndex === index ? [] : [{ column, direction }]
      )
    )
  }
  const clearDatabaseSort = () => {
    saveDatabaseSorts([])
  }
  const toggleSortPillVisibility = () => {
    setShowSortPill((visible) => {
      const nextVisible = !visible

      if (!nextVisible) {
        setSortPopoverOpen(false)
      }

      return nextVisible
    })
  }
  const saveDatabaseTitle = useCallback(
    (nextTitle: string) => {
      if (!databaseId || nextTitle === payload?.database.name) {
        return
      }

      updateDatabase.mutate({
        databaseId,
        name: nextTitle,
      })
    },
    [databaseId, payload?.database.name, updateDatabase]
  )
  const copyDatabaseViewLink = useCallback(() => {
    if (!databaseId || typeof window === "undefined") {
      return
    }

    void navigator.clipboard
      .writeText(`${window.location.origin}/database/${databaseId}`)
      .then(() => {
        toast.success("Copied link to view")
      })
      .catch(() => {
        toast.error("Couldn't copy link to view")
      })
  }, [databaseId])

  const openInsertPropertyMenu = (
    sourceColumnKey: string,
    sourcePosition: number,
    side: InsertPropertySide
  ) => {
    setPendingInsertProperty({
      position: sourcePosition + (side === "right" ? 1 : 0),
      side,
      sourceColumnKey,
    })
  }

  const clearPendingInsertProperty = (insertKey: string) => {
    setPendingInsertProperty((current) => {
      const currentKey = current
        ? `insert-property-${current.sourceColumnKey}-${current.side}`
        : null

      return currentKey === insertKey ? null : current
    })
  }

  const addInsertedDatabaseProperty = (
    type: string,
    label: string,
    position: number,
    insertKey: string
  ) => {
    addDatabaseProperty(type, label, position)
    clearPendingInsertProperty(insertKey)
  }

  const saveCell = (
    rowId: string,
    propertyId: string,
    propertyType: string,
    currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue
  ) => {
    if (!editable || !databaseId) {
      return
    }

    if (
      areSerializedPropertyValuesEqual(propertyType, currentValue, nextValue)
    ) {
      return
    }

    updateValue.mutate({
      databaseId,
      propertyId,
      rowId,
      value: serializePropertyValue(propertyType, nextValue),
    })
  }

  const resizeCellEditor = (element: HTMLTextAreaElement) => {
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }

  const handleCellInput = (event: FormEvent<HTMLTextAreaElement>) => {
    resizeCellEditor(event.currentTarget)
  }

  const startColumnResize = (
    columnKey: string,
    event: PointerEvent<HTMLSpanElement>
  ) => {
    if (!editable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = getColumnWidth(columnKey)

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(
        databaseColumnMinWidth,
        startWidth + moveEvent.clientX - startX
      )

      setColumnWidths((widths) => ({
        ...widths,
        [columnKey]: nextWidth,
      }))
    }

    const removeListeners = () => {
      document.body.classList.remove("database-resize-cursor")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", removeListeners)
      window.removeEventListener("pointercancel", removeListeners)
    }

    document.body.classList.add("database-resize-cursor")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", removeListeners)
    window.addEventListener("pointercancel", removeListeners)
  }

  const getRowDropTargetIndex = (clientY: number) => {
    const rowElements = getRowElements()

    if (rowElements.length === 0) {
      return 0
    }

    const targetIndex = rowElements.findIndex((rowElement) => {
      const rect = rowElement.getBoundingClientRect()

      return clientY < rect.top + rect.height / 2
    })

    return targetIndex === -1 ? rowElements.length : targetIndex
  }

  const moveDraggedRow = () => {
    if (!databaseId || !draggedRowId || rowDropTargetIndex === null || isTableSorted) {
      return
    }

    const sourceIndex = rows.findIndex((row) => row.id === draggedRowId)

    if (sourceIndex === -1) {
      return
    }

    const nextRows = [...rows]
    const [draggedRow] = nextRows.splice(sourceIndex, 1)
    const nextTargetIndex =
      rowDropTargetIndex > sourceIndex
        ? rowDropTargetIndex - 1
        : rowDropTargetIndex

    nextRows.splice(nextTargetIndex, 0, draggedRow)

    const rowIds = nextRows.map((row) => row.id)

    if (rowIds.every((rowId, index) => rowId === rows[index]?.id)) {
      return
    }

    reorderRows.mutate({ databaseId, rowIds })
  }

  const addDraggedPageRow = (
    dragPayload: DatabasePageDragPayload,
    position = rowDropTargetIndex
  ) => {
    if (!databaseId || position === null || addRow.isPending) {
      return
    }

    if (dragPayload.pageId === payload?.database.pageId) {
      toast.error("You can't nest a page inside itself.")
      return
    }

    if (rows.some((row) => row.pageId === dragPayload.pageId)) {
      toast.error("This page is already in this database.")
      return
    }

    addRow.mutate({
      databaseId,
      pageId: dragPayload.pageId,
      position,
      title: dragPayload.title,
    })
  }

  const isTableDragEvent = (event: ReactDragEvent<HTMLElement>) =>
    event.target instanceof HTMLElement &&
    Boolean(event.target.closest(".database-table-wrap"))

  const handleDatabaseBlockDragOver = (
    event: ReactDragEvent<HTMLDivElement>
  ) => {
    if (isTableDragEvent(event)) {
      return
    }

    if (!hasDatabasePageDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    measureRows()
    setRowDropTargetIndex(rows.length)
  }

  const handleDatabaseBlockDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (isTableDragEvent(event)) {
      return
    }

    const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

    if (!dragPayload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    addDraggedPageRow(dragPayload, rows.length)
    clearRowDrag()
  }

  const clearRowDrag = () => {
    setDraggedRowId(null)
    setRowDragOverlay(null)
    setRowDropTargetIndex(null)
  }

  const rowDropLineTop =
    rowDropTargetIndex === null
      ? null
      : (rowLayout.dropTops[rowDropTargetIndex] ?? null)
  const activeDragRowId = draggedRowId ?? hoveredRowId
  const activeDragRowIndex = activeDragRowId
    ? sortedRows.findIndex((row) => row.id === activeDragRowId)
    : -1
  const activeDragRow =
    activeDragRowIndex === -1 ? null : sortedRows[activeDragRowIndex]
  const renderInsertPropertyHeader = (
    insertKey: string,
    position: number
  ) => (
    <th
      className="database-add-property-cell database-insert-property-cell"
      key={insertKey}
    >
      <AddDatabasePropertyMenu
        disabled={addProperty.isPending}
        isPending={addProperty.isPending}
        onAdd={(type, label) =>
          addInsertedDatabaseProperty(type, label, position, insertKey)
        }
        onOpenChange={(open) => {
          if (!open) {
            clearPendingInsertProperty(insertKey)
          }
        }}
        open={pendingInsertPropertyKey === insertKey}
        triggerLabel="Select type"
      />
      <span
        aria-hidden="true"
        className="database-column-resize-handle"
        onPointerDown={(event) => startColumnResize(insertKey, event)}
      />
    </th>
  )
  const renderInsertPropertyCell = (insertKey: string) => (
    <td
      aria-hidden="true"
      className="database-value-cell database-insert-property-placeholder"
      key={insertKey}
    />
  )

  return (
      <div
        className={
          fullPage
            ? "database-block-shell database-block-shell-full"
            : "database-block-shell"
        }
        contentEditable={false}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as globalThis.Node | null
            )
          ) {
            setRowDropTargetIndex(null)
          }
        }}
        onDragOver={handleDatabaseBlockDragOver}
        onDrop={handleDatabaseBlockDrop}
      >
        <div className="database-toolbar">
          {showTitle ? (
            <div className="min-w-0 flex flex-1 flex-col items-start gap-2">
              <Input
                aria-label="Database title"
                className="database-title-input h-auto min-w-0 w-full rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:border-transparent focus-visible:ring-0 md:text-2xl dark:bg-transparent"
                disabled={!databaseId}
                onBlur={(event) => saveDatabaseTitle(event.target.value)}
                onChange={(event) => {
                  setDraftTitle(event.target.value)
                }}
                placeholder="New database"
                value={draftTitle}
              />
              {((activeDatabaseSorts.length > 0 && showSortPill) ||
                sortPopoverOpen) ? (
                <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label="Open sort options"
                      className="group h-8 rounded-full px-3"
                      type="button"
                      variant="secondary"
                    >
                      <ArrowDownUp className="size-4 self-center shrink-0" />
                      <span className="self-center truncate">
                        {activeDatabaseSorts.length === 0
                          ? "Sort"
                          : `${activeDatabaseSorts.length} sort${
                              activeDatabaseSorts.length === 1 ? "" : "s"
                            }`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-fit min-w-0 max-w-[calc(100vw-2rem)] gap-2 p-3"
                  >
                    <div className="flex w-fit max-w-full flex-col gap-2">
                      {activeDatabaseSorts.map((sort, index) => {
                        const availableSortOptions = sortColumnOptions.filter(
                          (option) =>
                            option.value === sort.column ||
                            !activeDatabaseSorts.some(
                              (activeSort, activeIndex) =>
                                activeIndex !== index &&
                                activeSort.column === option.value
                            )
                        )

                        return (
                          <div
                            className="flex items-center gap-2"
                            key={`${sort.column}:${index}`}
                          >
                            <ArrowDownUp className="size-4 text-muted-foreground" />
                            <Select
                              onValueChange={(column) =>
                                updateDatabaseSort(index, { column })
                              }
                              value={sort.column}
                            >
                              <SelectTrigger className="w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="start">
                                {availableSortOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              onValueChange={(direction) =>
                                updateDatabaseSort(index, {
                                  direction: direction as DatabaseSortDirection,
                                })
                              }
                              value={sort.direction}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="start">
                                <SelectItem value="ascending">Ascending</SelectItem>
                                <SelectItem value="descending">Descending</SelectItem>
                              </SelectContent>
                            </Select>
                            <button
                              aria-label={`Remove ${sort.label} sort`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              onClick={() => removeDatabaseSort(index)}
                              type="button"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        )
                      })}
                      {canAddDatabaseSort ? (
                        <DropDrawer
                          open={addSortPickerOpen}
                          onOpenChange={(open) => {
                            setAddSortPickerOpen(open)

                            if (!open) {
                              setAddSortPickerQuery("")
                            }
                          }}
                        >
                          <DropDrawerTrigger asChild>
                            <button
                              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              type="button"
                            >
                              <Plus className="size-4" />
                              <span>Add sort</span>
                            </button>
                          </DropDrawerTrigger>
                          <DropDrawerContent
                            align="start"
                            className="w-72"
                            onCloseAutoFocus={(event) => event.preventDefault()}
                          >
                            <div className="flex items-center gap-1.5 px-1.5 py-1">
                              <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" />
                              <Input
                                aria-label="Add sort property"
                                className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                                onChange={(event) =>
                                  setAddSortPickerQuery(event.target.value)
                                }
                                placeholder="Sort by..."
                                value={addSortPickerQuery}
                              />
                            </div>
                            <DropDrawerSeparator />
                            {filteredAddableSortColumnOptions.length > 0 ? (
                              filteredAddableSortColumnOptions.map((option) => (
                                <DropDrawerItem
                                  key={option.value}
                                  onSelect={(event) => {
                                    event.preventDefault()
                                    createDatabaseSort(option.value)
                                  }}
                                >
                                  {option.icon}
                                  <span>{option.label}</span>
                                </DropDrawerItem>
                              ))
                            ) : (
                              <DropDrawerItem disabled>
                                No properties found.
                              </DropDrawerItem>
                            )}
                          </DropDrawerContent>
                        </DropDrawer>
                      ) : null}
                      <button
                        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                        disabled={activeDatabaseSorts.length === 0}
                        onClick={clearDatabaseSort}
                        type="button"
                      >
                        <X className="size-4" />
                        <span>Delete sort</span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {editable ? (
            <>
              {activeDatabaseSorts.length === 0 ? (
                <DropDrawer open={sortPickerOpen} onOpenChange={setSortPickerOpen}>
                  <DropDrawerTrigger asChild>
                    <Button
                      aria-label="Add sort"
                      className="text-muted-foreground"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDownUp />
                    </Button>
                  </DropDrawerTrigger>
                  <DropDrawerContent
                    align="start"
                    className="w-72"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <div className="flex items-center gap-1.5 px-1.5 py-1">
                      <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        aria-label="Sort properties"
                        className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                        onChange={(event) => setSortPickerQuery(event.target.value)}
                        placeholder="Sort by..."
                        value={sortPickerQuery}
                      />
                    </div>
                    <DropDrawerSeparator />
                    {filteredSortColumnOptions.length > 0 ? (
                      filteredSortColumnOptions.map((option) => (
                        <DropDrawerItem
                          key={option.value}
                          onSelect={(event) => {
                            event.preventDefault()
                            createDatabaseSort(option.value)
                          }}
                        >
                          {option.icon}
                          <span>{option.label}</span>
                        </DropDrawerItem>
                      ))
                    ) : (
                      <DropDrawerItem disabled>No properties found.</DropDrawerItem>
                    )}
                  </DropDrawerContent>
                </DropDrawer>
              ) : (
                <Button
                  aria-label={showSortPill ? "Hide sort pill" : "Show sort pill"}
                  className={
                    showSortPill ? "text-foreground" : "text-muted-foreground"
                  }
                  onClick={toggleSortPillVisibility}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDownUp />
                </Button>
              )}
              <DatabaseViewSettingsMenu
                activeDatabaseSorts={activeDatabaseSorts}
                databaseName={payload?.database.name}
                draftTitle={draftTitle}
                nameColumnLabel={nameColumnLabel}
                onCopyDatabaseViewLink={copyDatabaseViewLink}
                onDraftTitleChange={setDraftTitle}
                onSaveDatabaseTitle={saveDatabaseTitle}
                properties={properties}
                visiblePropertyCount={visiblePropertyCount}
              />
              <Button
                className="database-new-button"
                disabled={!databaseId || addRow.isPending}
                onClick={addDatabaseRow}
                type="button"
              >
                {addRow.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                <span>New</span>
              </Button>
            </>
          ) : null}
          {showExpandButton && databaseId ? (
            <Button
              aria-label="Expand database"
              asChild
              className="database-expand-button"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link
                params={{ databaseId }}
                title="Expand database"
                to="/database/$databaseId"
              >
                <Maximize2 />
              </Link>
            </Button>
          ) : null}
        </div>
        {!databaseId ? (
          <div className="database-empty-state">
            <span>Database reference missing.</span>
          </div>
        ) : isLoading || !payload ? (
          <div className="database-empty-state">
            <Loader2 className="animate-spin" />
            <span>Loading database...</span>
          </div>
        ) : (
          <div
            className="database-table-wrap"
            ref={tableWrapRef}
            onMouseLeave={() => {
              if (!draggedRowId) {
                setHoveredRowId(null)
              }
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as globalThis.Node | null
                )
              ) {
                setRowDropTargetIndex(null)
              }
            }}
            onDragOver={(event) => {
              const hasDragPayload = hasDatabasePageDragPayload(
                event.dataTransfer
              )

              if (!draggedRowId && !hasDragPayload) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = "move"
              if (draggedRowId) {
                setRowDragOverlay((overlay) =>
                  overlay
                    ? {
                        ...overlay,
                        left: event.clientX - overlay.offsetX,
                        top: event.clientY - overlay.offsetY,
                      }
                    : overlay
                )
              }
              measureRows()
              setRowDropTargetIndex(getRowDropTargetIndex(event.clientY))
            }}
            onDrop={(event) => {
              const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

              if ((!draggedRowId && !dragPayload) || rowDropTargetIndex === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              if (draggedRowId) {
                moveDraggedRow()
              } else if (dragPayload) {
                addDraggedPageRow(dragPayload)
              }
              clearRowDrag()
            }}
          >
            {editable && !isTableSorted ? (
              <div className="database-row-drag-rail">
                {activeDragRow ? (
                  <button
                    aria-label={`Drag ${activeDragRow.page.name.trim() || "Untitled"}`}
                    className="database-row-drag-handle"
                    data-database-row-drag-handle
                    data-dragging={
                      draggedRowId === activeDragRow.id ? "true" : undefined
                    }
                    data-visible="true"
                    draggable
                    key="database-row-drag-handle"
                    onClick={(event) => event.preventDefault()}
                    onDragStart={(event) => {
                      measureRows()
                      const rowElement = tableWrapRef.current?.querySelector(
                        `tr[data-database-row-id="${activeDragRow.id}"]`
                      )
                      const rowRect = rowElement?.getBoundingClientRect()
                      const tableRect = tableWrapRef.current
                        ?.querySelector(".database-table")
                        ?.getBoundingClientRect()

                      if (rowRect && tableRect) {
                        setRowDragOverlay({
                          height: rowRect.height,
                          left: rowRect.left,
                          offsetX: event.clientX - rowRect.left,
                          offsetY: event.clientY - rowRect.top,
                          title: activeDragRow.page.name.trim() || "Untitled",
                          top: rowRect.top,
                          width: tableRect.width,
                        })
                      }

                      hideNativeDragPreview(event.dataTransfer)
                      setDraggedRowId(activeDragRow.id)
                      setRowDropTargetIndex(activeDragRowIndex)
                      event.dataTransfer.effectAllowed = "copyMove"
                      event.dataTransfer.setData(
                        DATABASE_PAGE_DRAG_MIME,
                        JSON.stringify({
                          databaseId: payload.database.id,
                          pageId: activeDragRow.pageId,
                          rowId: activeDragRow.id,
                        })
                      )
                      event.dataTransfer.setData(
                        "text/plain",
                        activeDragRow.page.name.trim() || "Untitled"
                      )
                    }}
                    onDragEnd={clearRowDrag}
                    onMouseEnter={() => {
                      measureRows()
                      setHoveredRowId(activeDragRow.id)
                    }}
                    style={{
                      top: rowLayout.centers[activeDragRow.id] ?? 0,
                    }}
                    title="Drag page"
                    type="button"
                  >
                    <GripVertical />
                  </button>
                ) : null}
              </div>
            ) : null}
            {rowDragOverlay ? (
              <div
                aria-hidden="true"
                className="database-row-drag-overlay"
                style={{
                  height: rowDragOverlay.height,
                  left: rowDragOverlay.left,
                  top: rowDragOverlay.top,
                  width: rowDragOverlay.width,
                }}
              >
                <span className="database-row-drag-overlay-cell">
                  <FileText />
                  <span>{rowDragOverlay.title}</span>
                </span>
              </div>
            ) : null}
            {rowDropLineTop !== null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-30 h-0.5 -translate-y-px bg-primary"
                style={{ top: rowDropLineTop }}
              />
            ) : null}
            <div className="database-table-scroll">
              <table
                className="database-table"
                style={
                  {
                    "--database-table-min-width": `${tableMinWidth}px`,
                  } as CSSProperties
                }
              >
              <colgroup>
                {columnKeys.map((key) => (
                  <col key={key} style={{ width: getColumnWidth(key) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {pendingInsertPropertyKey === "insert-property-name-left"
                    ? renderInsertPropertyHeader("insert-property-name-left", 0)
                    : null}
                  <th className="database-name-header">
                    {editable ? (
                      <DatabaseNamePropertyMenu
                        config={payload.database.config}
                        databaseId={payload.database.id}
                        onInsertProperty={(side) =>
                          openInsertPropertyMenu("name", 0, side)
                        }
                      />
                    ) : (
                      <span className="database-name-header-content">
                        <span>Aa</span>
                        <span>{nameColumnLabel}</span>
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className="database-column-resize-handle"
                      onPointerDown={(event) => startColumnResize("name", event)}
                    />
                  </th>
                  {pendingInsertPropertyKey === "insert-property-name-right"
                    ? renderInsertPropertyHeader("insert-property-name-right", 1)
                    : null}
                  {properties.map((property) => {
                    const leftInsertKey = `insert-property-${property.id}-left`
                    const rightInsertKey = `insert-property-${property.id}-right`
                    const showLeftInsert =
                      pendingInsertPropertyKey === leftInsertKey
                    const showRightInsert =
                      pendingInsertPropertyKey === rightInsertKey

                    return (
                      <Fragment key={property.id}>
                        {showLeftInsert
                          ? renderInsertPropertyHeader(
                              leftInsertKey,
                              pendingInsertProperty?.position ?? property.position
                            )
                          : null}
                        <th className="database-property-header">
                          {editable ? (
                            <DatabasePropertyMenu
                              config={property.property.config}
                              databaseConfig={payload.database.config}
                              databaseId={payload.database.id}
                              databasePropertyId={property.id}
                              name={property.property.name}
                              type={property.property.type}
                              onInsertProperty={(side) =>
                                openInsertPropertyMenu(
                                  property.id,
                                  property.position,
                                  side
                                )
                              }
                              onRename={(name) =>
                                updateProperty.mutate({
                                  databaseId: payload.database.id,
                                  databasePropertyId: property.id,
                                  name,
                                })
                              }
                            />
                          ) : (
                            <span className="database-property-header-label">
                              {property.property.name}
                            </span>
                          )}
                          <span
                            aria-hidden="true"
                            className="database-column-resize-handle"
                            onPointerDown={(event) =>
                              startColumnResize(property.id, event)
                            }
                          />
                        </th>
                        {showRightInsert
                          ? renderInsertPropertyHeader(
                              rightInsertKey,
                              pendingInsertProperty?.position ??
                                property.position + 1
                            )
                          : null}
                      </Fragment>
                    )
                  })}
                  {editable ? (
                    <th className="database-add-property-cell">
                      <AddDatabasePropertyMenu
                        disabled={addProperty.isPending}
                        isPending={addProperty.isPending}
                        onAdd={addDatabaseProperty}
                      />
                      <span
                        aria-hidden="true"
                        className="database-column-resize-handle"
                        onPointerDown={(event) =>
                          startColumnResize("add-property", event)
                        }
                      />
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    data-database-row-id={row.id}
                    key={row.id}
                    onMouseEnter={() => {
                      measureRows()
                      setHoveredRowId(row.id)
                    }}
                  >
                    {pendingInsertPropertyKey === "insert-property-name-left"
                      ? renderInsertPropertyCell("insert-property-name-left")
                      : null}
                    <td className="database-page-cell">
                      <DatabaseCellContent wrapContent={nameColumnWrapContent}>
                        <DatabasePageCell
                          onOpen={onOpenPage}
                          pageId={row.pageId}
                          showPageIcon={nameColumnShowPageIcon}
                        />
                      </DatabaseCellContent>
                    </td>
                    {pendingInsertPropertyKey === "insert-property-name-right"
                      ? renderInsertPropertyCell("insert-property-name-right")
                      : null}
                    {properties.map((property) => {
                      const leftInsertKey = `insert-property-${property.id}-left`
                      const rightInsertKey = `insert-property-${property.id}-right`
                      const showLeftInsert =
                        pendingInsertPropertyKey === leftInsertKey
                      const showRightInsert =
                        pendingInsertPropertyKey === rightInsertKey
                      const workspaceProperty = property.property
                      const key = `${row.pageId}:${workspaceProperty.id}`
                      const value = draftCells[key] ?? cellValues[key] ?? ""
                      const wrapContent = getPropertyWrapContent(
                        workspaceProperty.config
                      )
                      const isSelectProperty =
                        workspaceProperty.type === "select" ||
                        workspaceProperty.type === "multi_select" ||
                        workspaceProperty.type === "status"
                      const isCheckboxProperty =
                        workspaceProperty.type === "checkbox"
                      const isDateProperty = workspaceProperty.type === "date"
                      const isReadOnlyTimeCell = isReadOnlyTimeProperty(
                        workspaceProperty.type
                      )
                      const isPersonProperty = workspaceProperty.type === "person"
                      const isMultiSelectProperty =
                        workspaceProperty.type === "multi_select" ||
                        (isPersonProperty &&
                          getPersonLimit(workspaceProperty.config) !==
                            "one_person")

                      return (
                        <Fragment key={property.id}>
                          {showLeftInsert
                            ? renderInsertPropertyCell(leftInsertKey)
                            : null}
                          <td
                            className="database-value-cell"
                            data-active={activeCellKey === key ? "true" : undefined}
                            data-wrap-content={wrapContent ? "true" : undefined}
                          >
                            {isReadOnlyTimeCell ? (
                              <DatabaseCellContent wrapContent={wrapContent}>
                                <span className="database-input-cell-trigger">
                                  {getReadOnlyTimePropertyValue(
                                    row,
                                    workspaceProperty.type
                                  ) || (
                                    <span className="text-muted-foreground">
                                      Empty
                                    </span>
                                  )}
                                </span>
                              </DatabaseCellContent>
                            ) : isCheckboxProperty ? (
                              <DatabaseCellContent wrapContent={wrapContent}>
                                <div className="database-checkbox-cell">
                                  <Checkbox
                                    aria-label={`${workspaceProperty.name} value`}
                                    checked={value === "true"}
                                    disabled={!editable}
                                    onCheckedChange={(nextChecked) =>
                                      saveCell(
                                        row.id,
                                        workspaceProperty.id,
                                        workspaceProperty.type,
                                        cellValues[key] ?? "",
                                        nextChecked === true ? "true" : "false"
                                      )
                                    }
                                  />
                                </div>
                              </DatabaseCellContent>
                            ) : isSelectProperty || isPersonProperty ? (
                              <DatabaseCellContent wrapContent={wrapContent}>
                                <DatabaseSelectCell
                                  allowCreate={!isPersonProperty}
                                  databaseId={payload.database.id}
                                  editable={editable}
                                  defaultOptions={
                                    workspaceProperty.type === "status"
                                      ? defaultStatusOptions
                                      : isPersonProperty
                                        ? personOptions
                                      : undefined
                                  }
                                  multiple={isMultiSelectProperty}
                                  onSelect={(optionValue) =>
                                    saveCell(
                                      row.id,
                                      workspaceProperty.id,
                                      workspaceProperty.type,
                                      cellValues[key] ?? "",
                                      optionValue
                                    )
                                  }
                                  propertyConfig={workspaceProperty.config}
                                  propertyId={property.id}
                                  propertyName={workspaceProperty.name}
                                  showStatusDot={
                                    workspaceProperty.type === "status"
                                  }
                                  value={value}
                                  valueKey={isPersonProperty ? "id" : "name"}
                                />
                              </DatabaseCellContent>
                            ) : isDateProperty ? (
                              <DatabaseCellContent wrapContent={wrapContent}>
                                <DatabaseDateCell
                                  databaseId={payload.database.id}
                                  editable={editable}
                                  label={workspaceProperty.name}
                                  onOpenChange={(open) =>
                                    setActiveCellKey(open ? key : null)
                                  }
                                  onSelect={(nextValue) =>
                                    saveCell(
                                      row.id,
                                      workspaceProperty.id,
                                      workspaceProperty.type,
                                      cellValues[key] ?? "",
                                      nextValue
                                    )
                                  }
                                  propertyConfig={workspaceProperty.config}
                                  propertyId={property.id}
                                  value={value}
                                />
                              </DatabaseCellContent>
                            ) : (
                              <DatabaseCellContent wrapContent={wrapContent}>
                                <DatabaseInputCell
                                  label={workspaceProperty.name}
                                  editable={editable}
                                  onActivate={(element) => {
                                    setActiveCellKey(key)
                                    resizeCellEditor(element)
                                  }}
                                  onChange={(nextValue) =>
                                    setDraftCells((drafts) => ({
                                      ...drafts,
                                      [key]: nextValue,
                                    }))
                                  }
                                  onCommit={() => {
                                    const persistedValue = cellValues[key] ?? ""
                                    const nextValue = draftCells[key] ?? persistedValue

                                    saveCell(
                                      row.id,
                                      workspaceProperty.id,
                                      workspaceProperty.type,
                                      persistedValue,
                                      nextValue
                                    )
                                    setDraftCells((drafts) => {
                                      const nextDrafts = { ...drafts }

                                      delete nextDrafts[key]

                                      return nextDrafts
                                    })
                                  }}
                                  onDeactivate={() =>
                                    setActiveCellKey((currentKey) =>
                                      currentKey === key ? null : currentKey
                                    )
                                  }
                                  onInput={handleCellInput}
                                  propertyConfig={workspaceProperty.config}
                                  type={workspaceProperty.type}
                                  value={
                                    Array.isArray(value) ? value.join(", ") : value
                                  }
                                  wrapContent={wrapContent}
                                />
                              </DatabaseCellContent>
                            )}
                          </td>
                          {showRightInsert
                            ? renderInsertPropertyCell(rightInsertKey)
                            : null}
                        </Fragment>
                      )
                    })}
                    {editable ? <td /> : null}
                  </tr>
                ))}
              </tbody>
              </table>
              {editable ? (
                <div
                  className="database-page-create-row"
                  style={
                    {
                      "--database-table-min-width": `${tableMinWidth}px`,
                    } as CSSProperties
                  }
                >
                  <button
                    className="database-page-create database-page-create-full"
                    disabled={!databaseId || addRow.isPending}
                    onClick={addDatabaseRow}
                    type="button"
                  >
                    {addRow.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    <span>New page</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
  )
}
