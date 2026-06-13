import {
  useCallback,
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
import {
  cyclingColorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/packages/editor/components/editor/toolbar-data"
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
  DATABASE_PAGE_DRAG_MIME,
  defaultStatusOptions,
} from "../constants"
import { DatabasePropertyInput } from "../database-property-input"
import { DatabasePageLink } from "../shared/database-page-link"
import { DatabasePropertyValue } from "../shared/database-property-value"
import {
  serializePropertyValue,
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
} from "./database-kanban-config"
import { useDatabaseViewContext } from "../shared/database-view-context"
import { getDatabaseGroupMoveValue } from "../shared/database-group-values"
import {
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
} from "../shared/database-row-drag"

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
  rowId: string
  rowIds: string[]
}

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

function getKanbanGroupValues(
  value: DatabaseCellValue,
  propertyType: string
) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  const groupValues = values.map((item) => item.trim()).filter(Boolean)

  if (groupValues.length > 0) {
    return groupValues
  }

  return propertyType === "status"
    ? [defaultStatusOptions[0]?.name ?? "Not started"].filter(Boolean)
    : []
}

function getKanbanOptionGroupValue(option: DatabaseSelectOption) {
  return option.id === "empty" ? "" : option.name
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
    groupProperty,
    isAddingDatabaseRow,
    showPageIconInTitle,
    addDatabaseRow,
    onOpenPage,
    personOptions,
    items: allRows,
    savePropertyValue,
    setActivePropertyValueKey,
    setDraftPropertyValues,
    saveDatabaseSorts,
    sortedItems: items,
    updateDatabasePropertyConfig,
    visibleProperties,
    options,
  } = useDatabaseViewContext()
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [newKanbanOptionName, setNewKanbanOptionName] = useState("")
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

    const hasEmptyColumn = items.some((item: DatabaseRow) => {
      const key = `${item.pageId}:${groupProperty.property.id}`
      const value = propertyValuesByKey[key] ?? ""
      const groupValues = getKanbanGroupValues(
        value,
        groupProperty.property.type
      )

      return groupProperty.property.type !== "status" && groupValues.length === 0
    })

    return [
      ...options,
      ...(hasEmptyColumn ? [{ color: "gray", id: "empty", name: "Empty" }] : []),
    ]
  }, [groupProperty, items, options, propertyValuesByKey])
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

  const createKanbanOption = async () => {
    const optionName = newKanbanOptionName.trim()

    if (!groupProperty || !optionName || isCreatingKanbanOption) {
      setNewKanbanOptionName("")
      return
    }

    const hasMatchingOption = options.some(
      (option) => option.name.toLowerCase() === optionName.toLowerCase()
    )

    if (hasMatchingOption) {
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
      addDatabaseRow(createdOption.name, groupProperty)
      setNewKanbanOptionName("")
    } catch {
      toast.error("Couldn't create group")
    } finally {
      setIsCreatingKanbanOption(false)
    }
  }

  const onPropertyConfigChange = (databasePropertyId: string, config: unknown) =>
    updateDatabasePropertyConfig(databasePropertyId, config)
  const getKanbanOptionItems = useCallback(
    (option: DatabaseSelectOption) => {
      if (!groupProperty) {
        return []
      }

      const isEmptyOption = option.id === "empty"

      return items.filter((item: DatabaseRow) => {
        const key = `${item.pageId}:${groupProperty.property.id}`
        const value = propertyValuesByKey[key] ?? ""
        const groupValues = getKanbanGroupValues(
          value,
          groupProperty.property.type
        )

        return isEmptyOption
          ? groupValues.length === 0
          : groupValues.includes(option.name)
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
    const nextValue = getDatabaseGroupMoveValue({
      currentValue,
      propertyType: groupProperty.property.type,
      sourceGroupValue: draggedKanbanCard.sourceGroupValue,
      targetGroupValue: getKanbanOptionGroupValue(targetOption),
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
    option: DatabaseSelectOption,
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
    option: DatabaseSelectOption,
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
    option: DatabaseSelectOption,
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
    const workspaceProperty = property.property
    const key = `${row.pageId}:${workspaceProperty.id}`
    const persistedValue = propertyValuesByKey[key] ?? ""
    const value = draftPropertyValues[key] ?? persistedValue

    return (
      <div className="database-kanban-property" key={property.id}>
        <div className="database-kanban-property-label">
          {workspaceProperty.name}
        </div>
        <div className="database-kanban-property-value">
          <DatabasePropertyValue
            disabledSelect={disabledSelect}
            draftValues={draftPropertyValues}
            editable={editable}
            onActiveValueChange={setActivePropertyValueKey}
            onDraftValuesChange={setDraftPropertyValues}
            onPropertyConfigChange={onPropertyConfigChange}
            onSaveValue={savePropertyValue}
            persistedValue={persistedValue}
            personOptions={personOptions}
            property={property}
            row={row}
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
                const isEmptyOption = option.id === "empty"
                const optionItems = getKanbanOptionItems(option)
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
                        <span
                          aria-hidden="true"
                          className={getColorTokenDotClassName(option.color)}
                        />
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
                      {editable && !isEmptyOption ? (
                        <button
                          className="database-kanban-new-card"
                          disabled={!databaseId || isAddingDatabaseRow}
                          onClick={() => addDatabaseRow(option.name)}
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
              {editable ? (
                <section className="database-kanban-column database-kanban-new-column">
                  <div className="database-kanban-column-header database-kanban-new-column-header">
                    <div
                      className="database-kanban-new-group-input"
                      onClick={(event) => {
                        if (
                          event.target instanceof HTMLElement &&
                          event.target.closest(".database-input-cell-trigger")
                        ) {
                          return
                        }

                        event.currentTarget
                          .querySelector<HTMLButtonElement>(
                            ".database-input-cell-trigger"
                          )
                          ?.click()
                      }}
                    >
                      {isCreatingKanbanOption || isAddingDatabaseRow ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
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
                    </div>
                  </div>
                  <div className="database-kanban-cards" />
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="database-empty-state">
          <span>Add a select, multi-select, or status property to use Kanban.</span>
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
