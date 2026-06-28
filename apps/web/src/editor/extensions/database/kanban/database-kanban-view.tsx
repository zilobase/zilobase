import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"
import { GripVertical, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import {
  useMoveDatabaseRow,
  useReorderDatabaseRows,
} from "@notelab/features/databases"
import { useUpdatePage } from "@notelab/features/pages"
import {
  cyclingColorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DATABASE_PAGE_DRAG_MIME,
  defaultStatusOptions,
  getDatabasePropertyType,
} from "../constants"
import { DatabasePropertyDate } from "../database-property-date"
import { DatabasePropertyInput } from "../database-property-input"
import { DatabasePageLink } from "../shared/database-page-link"
import { DatabasePropertyValue } from "../shared/database-property-value"
import {
  firstScalarValue,
  serializePropertyValue,
  toStringArray,
  type DatabasePropertyValue as DatabaseCellValue,
} from "../utils"
import {
  getMergedPropertyConfig,
  type DatabasePropertyConfig,
} from "../shared/database-view-config"
import {
  useInlineDatabaseScroll,
} from "../shared/use-inline-database-scroll"
import {
  type DatabasePropertyListItem,
  type DatabaseSelectOption,
  canCreateKanbanGroup,
  canCreateRowInKanbanGroup,
  canMoveRowsAcrossKanbanGroups,
  isOptionBackedKanbanGroupProperty,
} from "./database-kanban-config"
import { useDatabaseViewContext } from "../shared/database-view-context"
import { useDatabaseRowsScroll } from "../shared/use-database-rows-scroll"
import { NameColumnGlyph } from "../shared/name-column-glyph"
import { getDatabaseGroupMoveValue } from "../shared/database-group-values"
import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
} from "../shared/database-row-drag"
import { formatDatabaseDateValue } from "../shared/database-date-config"

type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"

type DraggedKanbanCard = {
  pageId: string
  rowId: string
  sourceOptionId: string
  sourceGroupValue: string
}

type DatabaseRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
    name?: string
    updatedAt?: string
  }
  pageId: string
  updatedAt: string
}

type KanbanCardDropTarget = {
  optionId: string
  targetIndex: number
}

type KanbanCardMove = {
  groupPropertyId?: string
  groupValue?: unknown
  pageId?: string
  pageTitle?: string
  rowId: string
  rowIds: string[]
}

type KanbanGroupOption = DatabaseSelectOption & {
  groupValue: string
  isEmpty?: boolean
  isTemporary?: boolean
}

const NEW_KANBAN_GROUP_TRIGGER_SELECTOR =
  ".database-input-cell-trigger, .database-date-cell-trigger"

function getKanbanBoardContentWidth(boardElement: HTMLDivElement) {
  const columns = Array.from(
    boardElement.querySelectorAll<HTMLElement>(".database-kanban-column")
  )

  if (columns.length === 0) {
    return 0
  }

  const firstColumnRect = columns[0]?.getBoundingClientRect()
  const lastColumnRect = columns.at(-1)?.getBoundingClientRect()

  if (!firstColumnRect || !lastColumnRect) {
    return 0
  }

  return lastColumnRect.right - firstColumnRect.left
}

function getNextOptionColor(options: DatabaseSelectOption[]) {
  return (
    cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ??
    "default"
  )
}

function getSelectOptionSort(config: unknown): SelectOptionSortValue {
  if (!config || typeof config !== "object" || !("selectOptionSort" in config)) {
    return "manual"
  }

  const selectOptionSort = (config as DatabasePropertyConfig).selectOptionSort

  return selectOptionSort === "alphabetical" ||
    selectOptionSort === "reverse_alphabetical"
    ? selectOptionSort
    : "manual"
}

function getSortedSelectOptions(
  options: DatabaseSelectOption[],
  sort: SelectOptionSortValue
) {
  if (sort === "manual") {
    return options
  }

  const sortedOptions = [...options].sort((firstOption, secondOption) =>
    firstOption.name.localeCompare(secondOption.name, undefined, {
      sensitivity: "base",
    })
  )

  return sort === "reverse_alphabetical"
    ? sortedOptions.reverse()
    : sortedOptions
}

function getReadOnlyTimeGroupValue(row: DatabaseRow, propertyType: string) {
  return propertyType === "created_time"
    ? row.page.createdAt ?? row.createdAt
    : row.page.updatedAt ?? row.updatedAt
}

function getKanbanGroupValues({
  property,
  propertyValuesByKey,
  row,
}: {
  property: DatabasePropertyListItem
  propertyValuesByKey: Record<string, DatabaseCellValue>
  row: DatabaseRow
}) {
  if (property.id === "name") {
    return row.page.name?.trim() ? [row.page.name.trim()] : []
  }

  if (
    property.property.type === "created_time" ||
    property.property.type === "edited_time"
  ) {
    const value = getReadOnlyTimeGroupValue(row, property.property.type)

    return value?.trim() ? [value] : []
  }

  const key = `${row.pageId}:${property.property.id}`
  const value = propertyValuesByKey[key] ?? ""

  if (property.property.type === "checkbox") {
    return [value === "true" ? "true" : "false"]
  }

  const values = toStringArray(value)
  const groupValues = values.map((item) => item.trim()).filter(Boolean)

  if (groupValues.length > 0) {
    return groupValues
  }

  return property.property.type === "status"
    ? [defaultStatusOptions[0]?.name ?? "Not started"].filter(Boolean)
    : []
}

function getKanbanGroupLabel({
  groupValue,
  personOptionsById,
  property,
}: {
  groupValue: string
  personOptionsById: Map<string, string>
  property: DatabasePropertyListItem
}) {
  if (!groupValue) {
    return "Empty"
  }

  if (property.property.type === "checkbox") {
    return groupValue === "true" ? "Checked" : "Unchecked"
  }

  if (property.property.type === "date") {
    return (
      formatDatabaseDateValue(groupValue, property.property.config) || groupValue
    )
  }

  if (
    property.property.type === "created_time" ||
    property.property.type === "edited_time"
  ) {
    return (
      formatDatabaseDateValue(groupValue, property.property.config) || groupValue
    )
  }

  if (property.property.type === "person") {
    return personOptionsById.get(groupValue) ?? groupValue
  }

  return groupValue
}

function getDerivedKanbanGroupId(groupValue: string, propertyType: string) {
  return groupValue ? `${propertyType}:${groupValue}` : "empty"
}

function getKanbanOptionGroupValue(option: KanbanGroupOption) {
  return option.groupValue
}

function isInteractiveKanbanDragTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.closest(".database-kanban-card-drag-handle")) {
    return false
  }

  return Boolean(
    target.closest(
      [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "[contenteditable='true']",
        "[data-database-cell-input]",
        ".database-checkbox-cell",
        ".database-date-cell-trigger",
        ".database-input-cell-trigger",
        ".database-select-cell-trigger",
      ].join(",")
    )
  )
}

export function DatabaseKanbanView() {
  const {
    activeDatabaseFilters,
    activeDatabaseSorts,
    propertyValuesByKey,
    databaseId,
    draftPropertyValues,
    editable,
    fetchNextPage,
    groupProperty,
    groupableProperties,
    hasNextPage,
    isAddingDatabaseRow,
    isFetchingNextPage,
    showPageIconInTitle,
    addDatabaseRow,
    onOpenPage,
    personOptions,
    properties,
    items: allRows,
    savePropertyValue,
    setActivePropertyValueKey,
    setDraftPropertyValues,
    setViewGroupProperty,
    saveDatabaseSorts,
    sortedItems: items,
    titlePropertyLabel,
    updateDatabasePropertyConfig,
    visibleProperties,
    options,
  } = useDatabaseViewContext()
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const updatePage = useUpdatePage()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [newKanbanOptionName, setNewKanbanOptionName] = useState("")
  const [temporaryKanbanOptions, setTemporaryKanbanOptions] = useState<
    KanbanGroupOption[]
  >([])
  const [isCreatingKanbanOption, setIsCreatingKanbanOption] = useState(false)
  const [draggedKanbanCard, setDraggedKanbanCard] =
    useState<DraggedKanbanCard | null>(null)
  const [dragOverKanbanOptionId, setDragOverKanbanOptionId] =
    useState<string | null>(null)
  const [kanbanCardDropTarget, setKanbanCardDropTarget] =
    useState<KanbanCardDropTarget | null>(null)
  const [pendingSortedKanbanCardMove, setPendingSortedKanbanCardMove] =
    useState<KanbanCardMove | null>(null)
  const isKanbanSorted = activeDatabaseSorts.length > 0
  const isKanbanFiltered = activeDatabaseFilters.length > 0
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((person) => [person.id, person.name])),
    [personOptions]
  )
  const kanbanCardDragTitle = (() => {
    if (isKanbanSorted && isKanbanFiltered) {
      return "Drag page. Clear sorting to save the new order; hidden cards keep their relative order."
    }

    if (isKanbanSorted) {
      return "Drag page. Clear sorting to save the new order."
    }

    if (isKanbanFiltered) {
      return "Drag page. Hidden cards keep their relative order."
    }

    return "Drag page"
  })()
  const kanbanOptions = useMemo(() => {
    if (!groupProperty) {
      return []
    }

    const nextOptions: KanbanGroupOption[] = []
    const optionsByGroupValue = new Map<string, KanbanGroupOption>()
    const addOption = (option: KanbanGroupOption) => {
      if (optionsByGroupValue.has(option.groupValue)) {
        return
      }

      optionsByGroupValue.set(option.groupValue, option)
      nextOptions.push(option)
    }

    if (groupProperty.property.type === "checkbox") {
      addOption({
        color: "green",
        groupValue: "true",
        id: "checkbox-true",
        name: "Checked",
      })
      addOption({
        color: "gray",
        groupValue: "false",
        id: "checkbox-false",
        name: "Unchecked",
      })
    } else {
      options.forEach((option) =>
        addOption({
          ...option,
          groupValue: option.name,
        })
      )
    }

    temporaryKanbanOptions.forEach(addOption)

    let hasEmptyColumn = false

    items.forEach((item: DatabaseRow) => {
      const groupValues = getKanbanGroupValues({
        property: groupProperty,
        propertyValuesByKey,
        row: item,
      })

      if (groupValues.length === 0) {
        hasEmptyColumn = true
        return
      }

      groupValues.forEach((groupValue) => {
        addOption({
          groupValue,
          id: getDerivedKanbanGroupId(
            groupValue,
            groupProperty.property.type
          ),
          name: getKanbanGroupLabel({
            groupValue,
            personOptionsById,
            property: groupProperty,
          }),
        })
      })
    })

    if (
      hasEmptyColumn &&
      groupProperty.property.type !== "status" &&
      groupProperty.property.type !== "checkbox"
    ) {
      addOption({
        color: "gray",
        groupValue: "",
        id: "empty",
        isEmpty: true,
        name: "Empty",
      })
    }

    return nextOptions
  }, [
    groupProperty,
    items,
    options,
    personOptionsById,
    propertyValuesByKey,
    temporaryKanbanOptions,
  ])
  useEffect(() => {
    setTemporaryKanbanOptions([])
  }, [groupProperty?.id])
  const getInlineKanbanContentWidth = useCallback(() => {
    const boardElement = boardRef.current

    return boardElement ? getKanbanBoardContentWidth(boardElement) : 0
  }, [])
  const {
    isInlineScrollEnabled: isInlineKanbanScrollEnabled,
    style: kanbanWrapStyle,
  } = useInlineDatabaseScroll({
    contentRef: boardRef,
    enabled: Boolean(groupProperty),
    getContentWidth: getInlineKanbanContentWidth,
    measureKey: `${kanbanOptions.length}:${editable}`,
    scrollRef,
    wrapperRef: wrapRef,
  })
  const { sentinelRef: rowsScrollSentinelRef } = useDatabaseRowsScroll({
    enabled: Boolean(groupProperty),
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  })

  const createKanbanOption = async (nextOptionName = newKanbanOptionName) => {
    const optionName = nextOptionName.trim()

    if (
      !groupProperty ||
      !optionName ||
      !canCreateKanbanGroup(groupProperty) ||
      isCreatingKanbanOption
    ) {
      setNewKanbanOptionName("")
      return
    }

    const normalizedOptionName = optionName.toLowerCase()
    const hasMatchingOption = kanbanOptions.some(
      (option) =>
        option.name.toLowerCase() === normalizedOptionName ||
        option.groupValue.toLowerCase() === normalizedOptionName
    )

    if (hasMatchingOption) {
      setNewKanbanOptionName("")
      return
    }

    if (!isOptionBackedKanbanGroupProperty(groupProperty)) {
      setTemporaryKanbanOptions((currentOptions) => [
        ...currentOptions,
        {
          groupValue: optionName,
          id: `temporary-${crypto.randomUUID()}`,
          isTemporary: true,
          name: getKanbanGroupLabel({
            groupValue: optionName,
            personOptionsById,
            property: groupProperty,
          }),
        },
      ])
      setNewKanbanOptionName("")
      return
    }

    const createdOption = {
      color: getNextOptionColor(options),
      id: crypto.randomUUID(),
      name: optionName,
    }
    const nextOptions = [
      ...options,
      createdOption,
    ]
    const sortedOptions = getSortedSelectOptions(
      nextOptions,
      getSelectOptionSort(groupProperty.property.config)
    )

    setIsCreatingKanbanOption(true)

    try {
      await updateDatabasePropertyConfig(
        groupProperty.id,
        getMergedPropertyConfig(groupProperty.property.config, {
          options: sortedOptions,
        })
      )
      setNewKanbanOptionName("")
    } catch {
      toast.error("Couldn't create group")
    } finally {
      setIsCreatingKanbanOption(false)
    }
  }

  const createKanbanDateGroup = (value: DatabaseCellValue) => {
    const nextValue = firstScalarValue(value)

    setNewKanbanOptionName(nextValue)

    if (nextValue.trim()) {
      void createKanbanOption(nextValue)
    }
  }

  const onPropertyConfigChange = (databasePropertyId: string, config: unknown) =>
    updateDatabasePropertyConfig(databasePropertyId, config)
  const getKanbanOptionItems = useCallback(
    (option: KanbanGroupOption) => {
      if (!groupProperty) {
        return []
      }

      return items.filter((item: DatabaseRow) => {
        const groupValues = getKanbanGroupValues({
          property: groupProperty,
          propertyValuesByKey,
          row: item,
        })

        return option.isEmpty
          ? groupValues.length === 0
          : groupValues.includes(option.groupValue)
      })
    },
    [groupProperty, items, propertyValuesByKey]
  )
  const clearKanbanCardDrag = () => {
    setDraggedKanbanCard(null)
    setDragOverKanbanOptionId(null)
    setKanbanCardDropTarget(null)
  }
  const getKanbanCardDropTargetIndex = (
    columnElement: HTMLElement,
    clientY: number
  ) => {
    const cardElements = Array.from(
      columnElement.querySelectorAll<HTMLElement>(
        ".database-kanban-card[data-database-row-id]"
      )
    )

    if (cardElements.length === 0) {
      return 0
    }

    const targetIndex = cardElements.findIndex((cardElement) => {
      const rect = cardElement.getBoundingClientRect()

      return clientY < rect.top + rect.height / 2
    })

    return targetIndex === -1 ? cardElements.length : targetIndex
  }
  const getDraggedKanbanCardMove = (
    dropTarget = kanbanCardDropTarget
  ): KanbanCardMove | null => {
    if (!draggedKanbanCard || !dropTarget || !groupProperty) {
      return null
    }

    const targetOption =
      kanbanOptions.find((option) => option.id === dropTarget.optionId) ?? null

    if (!targetOption) {
      return null
    }

    const targetOptionItems = getKanbanOptionItems(targetOption)

    if (draggedKanbanCard.sourceOptionId === targetOption.id) {
      const rowIds = getFilteredReorderedRowIds(
        allRows,
        targetOptionItems,
        draggedKanbanCard.rowId,
        dropTarget.targetIndex
      )

      return rowIds
        ? { rowId: draggedKanbanCard.rowId, rowIds }
        : null
    }

    if (!canMoveRowsAcrossKanbanGroups(groupProperty)) {
      return null
    }

    const draggedRow = allRows.find((row) => row.id === draggedKanbanCard.rowId)

    if (!draggedRow) {
      return null
    }

    const rowIds =
      getAnchoredReorderedRowIds(
        allRows,
        draggedKanbanCard.rowId,
        targetOptionItems,
        dropTarget.targetIndex
      ) ?? allRows.map((row) => row.id)
    const key = `${draggedRow.pageId}:${groupProperty.property.id}`
    const currentValue = propertyValuesByKey[key] ?? ""
    const targetGroupValue = getKanbanOptionGroupValue(targetOption)

    if (groupProperty.id === "name") {
      return {
        pageId: draggedRow.pageId,
        pageTitle: targetGroupValue,
        rowId: draggedKanbanCard.rowId,
        rowIds,
      }
    }

    const nextValue = getDatabaseGroupMoveValue({
      currentValue,
      propertyType: groupProperty.property.type,
      sourceGroupValue: draggedKanbanCard.sourceGroupValue,
      targetGroupValue,
    })

    return {
      groupPropertyId: groupProperty.property.id,
      groupValue: serializePropertyValue(
        groupProperty.property.type,
        nextValue
      ),
      rowId: draggedKanbanCard.rowId,
      rowIds,
    }
  }
  const applyKanbanCardMove = (nextMove: KanbanCardMove) => {
    if (!databaseId) {
      return
    }

    if (nextMove.pageId && typeof nextMove.pageTitle === "string") {
      updatePage.mutate(
        {
          id: nextMove.pageId,
          name: nextMove.pageTitle,
        },
        {
          onSuccess: () => {
            reorderRows.mutate({ databaseId, rowIds: nextMove.rowIds })
          },
          onError: () => {
            toast.error("Couldn't rename page")
          },
        }
      )
      return
    }

    if (nextMove.groupPropertyId) {
      moveRow.mutate({
        databaseId,
        groupPropertyId: nextMove.groupPropertyId,
        groupValue: nextMove.groupValue,
        rowId: nextMove.rowId,
        rowIds: nextMove.rowIds,
      })
      return
    }

    reorderRows.mutate({ databaseId, rowIds: nextMove.rowIds })
  }
  const confirmSortedKanbanCardMove = () => {
    if (!databaseId || !pendingSortedKanbanCardMove) {
      setPendingSortedKanbanCardMove(null)
      return
    }

    const nextMove = pendingSortedKanbanCardMove

    setPendingSortedKanbanCardMove(null)
    void saveDatabaseSorts([])
      .then(() => {
        applyKanbanCardMove(nextMove)
      })
      .catch(() => {
        toast.error("Couldn't clear sort")
      })
  }
  const startKanbanCardDrag = (
    row: DatabaseRow,
    option: KanbanGroupOption,
    event: ReactDragEvent<HTMLElement>
  ) => {
    if (!editable || !databaseId || !groupProperty) {
      event.preventDefault()
      return
    }

    if (isInteractiveKanbanDragTarget(event.target)) {
      event.preventDefault()
      return
    }

    const title = row.page.name?.trim() || "Untitled"
    const payload = {
      pageId: row.pageId,
      rowId: row.id,
      sourceOptionId: option.id,
      sourceGroupValue: getKanbanOptionGroupValue(option),
    }

    event.stopPropagation()
    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setData(
      DATABASE_PAGE_DRAG_MIME,
      JSON.stringify({
        databaseId,
        pageId: row.pageId,
        rowId: row.id,
        title,
      })
    )
    event.dataTransfer.setData("text/plain", title)

    setDraggedKanbanCard(payload)
    setDragOverKanbanOptionId(option.id)
    setKanbanCardDropTarget({
      optionId: option.id,
      targetIndex: Math.max(
        0,
        getKanbanOptionItems(option).findIndex((item) => item.id === row.id)
      ),
    })
  }
  const handleKanbanColumnDragOver = (
    option: KanbanGroupOption,
    event: ReactDragEvent<HTMLElement>
  ) => {
    if (!editable || !groupProperty || !draggedKanbanCard) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "move"
    setDragOverKanbanOptionId(option.id)
    setKanbanCardDropTarget({
      optionId: option.id,
      targetIndex: getKanbanCardDropTargetIndex(
        event.currentTarget,
        event.clientY
      ),
    })
  }
  const handleKanbanColumnDrop = (
    option: KanbanGroupOption,
    event: ReactDragEvent<HTMLElement>
  ) => {
    if (!editable || !databaseId || !groupProperty || !draggedKanbanCard) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const dropTarget = kanbanCardDropTarget ?? {
      optionId: option.id,
      targetIndex: getKanbanCardDropTargetIndex(
        event.currentTarget,
        event.clientY
      ),
    }
    const nextMove = getDraggedKanbanCardMove(dropTarget)

    if (isKanbanSorted) {
      if (nextMove) {
        setPendingSortedKanbanCardMove(nextMove)
      }
    } else if (nextMove) {
      applyKanbanCardMove(nextMove)
    }

    clearKanbanCardDrag()
  }
  const renderCardProperty = (
    row: DatabaseRow,
    property: DatabasePropertyListItem,
    disabledSelect = false
  ) => {
    const pageProperty = property.property
    const key = `${row.pageId}:${pageProperty.id}`
    const persistedValue = propertyValuesByKey[key] ?? ""
    const value = draftPropertyValues[key] ?? persistedValue

    return (
      <div className="database-kanban-property" key={property.id}>
        <div className="database-kanban-property-label">
          {pageProperty.name}
        </div>
        <div className="database-kanban-property-value">
          <DatabasePropertyValue
            disabledSelect={disabledSelect}
            draftValues={draftPropertyValues}
            editable={editable}
            properties={properties}
            propertyValuesByKey={propertyValuesByKey}
            onActiveValueChange={setActivePropertyValueKey}
            onDraftValuesChange={setDraftPropertyValues}
            onPropertyConfigChange={onPropertyConfigChange}
            onSaveValue={savePropertyValue}
            persistedValue={persistedValue}
            personOptions={personOptions}
            property={property}
            row={row}
            titlePropertyLabel={titlePropertyLabel}
            value={value}
          />
        </div>
      </div>
    )
  }
  return (
    <>
      <div
        className="database-kanban-wrap database-inline-scroll-wrap"
        data-inline-scroll={isInlineKanbanScrollEnabled ? "true" : undefined}
        ref={wrapRef}
        style={kanbanWrapStyle}
      >
      {groupProperty ? (
        <div
          className="database-kanban-scroll database-inline-scroll"
          ref={scrollRef}
        >
          <div className="database-kanban-scroll-content database-inline-scroll-content">
            <div className="database-kanban-board" ref={boardRef}>
              {kanbanOptions.map((option) => {
                const isEmptyOption = option.isEmpty === true
                const optionItems = getKanbanOptionItems(option)
                const canAddPageToOption =
                  !isEmptyOption && canCreateRowInKanbanGroup(groupProperty)
                const activeCardDropTarget =
                  kanbanCardDropTarget?.optionId === option.id &&
                  getDraggedKanbanCardMove(kanbanCardDropTarget)
                    ? kanbanCardDropTarget
                    : null

                return (
                  <section
                    className="database-kanban-column"
                    data-drag-over={
                      dragOverKanbanOptionId === option.id
                        ? "true"
                        : undefined
                    }
                    key={option.id}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as globalThis.Node | null
                        )
                      ) {
                        setDragOverKanbanOptionId(null)
                        setKanbanCardDropTarget((currentTarget) =>
                          currentTarget?.optionId === option.id
                            ? null
                            : currentTarget
                        )
                      }
                    }}
                    onDragOver={(event) =>
                      handleKanbanColumnDragOver(option, event)
                    }
                    onDrop={(event) => handleKanbanColumnDrop(option, event)}
                  >
                    <div className="database-kanban-column-header">
                      <span className={getColorTokenBadgeClassName(option.color)}>
                        {option.color ? (
                          <span
                            aria-hidden="true"
                            className={getColorTokenDotClassName(option.color)}
                          />
                        ) : null}
                        {option.name}
                      </span>
                      <span className="database-kanban-count">
                        {optionItems.length}
                      </span>
                    </div>
                    <div className="database-kanban-cards">
                      {optionItems.map((item: DatabaseRow, index: number) => (
                        <article
                          className="database-kanban-card"
                          data-database-row-id={item.id}
                          data-drop-before={
                            activeCardDropTarget?.targetIndex === index
                              ? "true"
                              : undefined
                          }
                          data-dragging={
                            draggedKanbanCard?.rowId === item.id
                              ? "true"
                              : undefined
                          }
                          draggable={editable}
                          key={item.id}
                          onDragEnd={clearKanbanCardDrag}
                          onDragStart={(event) =>
                            startKanbanCardDrag(item, option, event)
                          }
                        >
                          <div
                            className="database-kanban-card-title"
                            data-can-drag={editable ? "true" : undefined}
                          >
                            {editable ? (
                              <button
                                aria-label="Drag page"
                                className="database-kanban-card-drag-handle"
                                draggable
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                }}
                                onDragEnd={clearKanbanCardDrag}
                                onDragStart={(event) =>
                                  startKanbanCardDrag(item, option, event)
                                }
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                                title={kanbanCardDragTitle}
                                type="button"
                              >
                                <GripVertical />
                              </button>
                            ) : null}
                            <DatabasePageLink
                              editable={editable}
                              onOpen={onOpenPage}
                              pageId={item.pageId}
                              pageSummary={{
                                id: item.pageId,
                                name: item.page.name ?? "",
                              }}
                              showPageIcon={showPageIconInTitle}
                            />
                          </div>
                          {visibleProperties.length > 0 ? (
                            <div className="database-kanban-card-properties">
                              {visibleProperties.map(
                                (property: DatabasePropertyListItem) =>
                                  renderCardProperty(
                                    item,
                                    property,
                                    isEmptyOption &&
                                      property.property.id ===
                                        groupProperty.property.id
                                  )
                              )}
                            </div>
                          ) : null}
                        </article>
                      ))}
                      {activeCardDropTarget?.targetIndex ===
                      optionItems.length ? (
                        <div className="database-kanban-card-drop-line" />
                      ) : null}
                      {editable && canAddPageToOption ? (
                        <button
                          className="database-kanban-new-card"
                          disabled={!databaseId || isAddingDatabaseRow}
                          onClick={() =>
                            addDatabaseRow(option.groupValue, groupProperty)
                          }
                          type="button"
                        >
                          {isAddingDatabaseRow ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Plus />
                          )}
                          <span>New page</span>
                        </button>
                      ) : null}
                    </div>
                  </section>
                )
              })}
              {editable && canCreateKanbanGroup(groupProperty) ? (
                <section className="database-kanban-column database-kanban-new-column">
                  <div className="database-kanban-column-header database-kanban-new-column-header">
                    <div
                      className="database-kanban-new-group-input"
                      onClick={(event) => {
                        if (
                          event.target instanceof HTMLElement &&
                          event.target.closest(NEW_KANBAN_GROUP_TRIGGER_SELECTOR)
                        ) {
                          return
                        }

                        event.currentTarget
                          .querySelector<HTMLElement>(
                            NEW_KANBAN_GROUP_TRIGGER_SELECTOR
                          )
                          ?.click()
                      }}
                    >
                      {isCreatingKanbanOption || isAddingDatabaseRow ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                      {groupProperty.property.type === "date" ? (
                        <DatabasePropertyDate
                          editable={!isCreatingKanbanOption}
                          label="New group"
                          onPropertyConfigChange={(config) =>
                            onPropertyConfigChange(groupProperty.id, config)
                          }
                          onSelect={createKanbanDateGroup}
                          propertyConfig={groupProperty.property.config}
                          value={newKanbanOptionName}
                        />
                      ) : (
                        <DatabasePropertyInput
                          editable={!isCreatingKanbanOption}
                          label="New group"
                          onChange={setNewKanbanOptionName}
                          onCommit={() => {
                            void createKanbanOption()
                          }}
                          type="text"
                          value={newKanbanOptionName}
                        />
                      )}
                    </div>
                  </div>
                  <div className="database-kanban-cards" />
                </section>
              ) : null}
            </div>
            {hasNextPage || isFetchingNextPage ? (
              <div
                aria-hidden={!isFetchingNextPage}
                className="database-rows-pagination-status flex items-center justify-center gap-2 px-4 py-3 text-sm text-muted-foreground"
                ref={rowsScrollSentinelRef}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Loading more rows...</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-sm text-muted-foreground">
          <span>Group this Kanban view by</span>
          <Select onValueChange={setViewGroupProperty}>
            <SelectTrigger className="min-w-56">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent align="center">
              {groupableProperties.map((property) => {
                const PropertyIcon =
                  property.id === "name"
                    ? null
                    : getDatabasePropertyType(property.property.type).icon

                return (
                  <SelectItem
                    key={property.id}
                    value={property.property.id}
                  >
                    {PropertyIcon ? (
                      <PropertyIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <NameColumnGlyph />
                    )}
                    <span>{property.property.name}</span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      </div>
      <AlertDialog
        open={pendingSortedKanbanCardMove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSortedKanbanCardMove(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
            <AlertDialogDescription>
              Row order is manual. To save this move, Notelab needs to clear the
              active sorting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSortedKanbanCardMove}>
              Clear sorting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
