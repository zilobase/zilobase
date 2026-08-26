import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import {
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
  defaultStatusOption,
  getNextDatabaseOptionColor,
  getDatabasePropertyType,
} from "../../core/database-property-types"
import { DatabasePropertyDate } from "../../properties/database-property-date"
import { DatabasePropertyInput } from "../../properties/database-property-input"
import { DatabasePageLink } from "../../interactions/database-page-link"
import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import { DatabasePropertyMenu } from "../../properties/database-property-menu"
import { DatabasePropertyValue } from "../../properties/database-property-value"
import { DatabaseCellContent } from "../database-cell-content"
import {
  firstScalarValue,
  toStringArray,
  type DatabasePropertyValue as DatabaseCellValue,
} from "../../core/utils"
import {
  getMergedPropertyConfig,
  getPropertyWrapContent,
  type DatabasePropertyConfig,
} from "../database-view-config"
import {
  useInlineDatabaseScroll,
} from "../../interactions/use-inline-database-scroll"
import {
  type DatabasePropertyListItem,
  type DatabaseSelectOption,
  canCreateKanbanGroup,
  canCreateRowInKanbanGroup,
  isOptionBackedKanbanGroupProperty,
} from "./database-kanban-config"
import { useDatabaseViewContext } from "../database-view-context"
import { useDatabaseRowsScroll } from "../../interactions/use-database-rows-scroll"
import { NameColumnGlyph } from "../../interactions/name-column-glyph"
import { formatDatabaseDateValue } from "../../properties/database-date-config"
import { useDatabaseKanbanCardDrag } from "./use-database-kanban-card-drag"

type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"

type DatabaseRow = SortableDatabaseItem

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
    ? [defaultStatusOption.name]
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

export function DatabaseKanbanView() {
  const {
    activeDatabaseSorts,
    propertyValuesByKey,
    canAddDatabaseProperties,
    databaseConfig,
    databaseId,
    databaseName,
    databaseWorkspaceId,
    editable,
    fetchNextPage,
    groupProperty,
    groupableProperties,
    headerMenusEnabled,
    hasNextPage,
    isAddingDatabaseRow,
    isFetchingNextPage,
    layoutSettings,
    showPageIconInTitle,
    showPropertyTitles,
    addDatabaseRow,
    addDraggedPageRow,
    onOpenPage,
    personOptions,
    properties,
    items: allRows,
    savePropertyValue,
    setViewGroupProperty,
    saveDatabaseSorts,
    sortedItems: items,
    titlePropertyLabel,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    visibleProperties,
    workspaceId,
    options,
    addDatabaseProperty,
  } = useDatabaseViewContext()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [newKanbanOptionName, setNewKanbanOptionName] = useState("")
  const [temporaryKanbanOptions, setTemporaryKanbanOptions] = useState<
    KanbanGroupOption[]
  >([])
  const [isCreatingKanbanOption, setIsCreatingKanbanOption] = useState(false)
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
    null
  )
  const isKanbanSorted = activeDatabaseSorts.length > 0
  const canEditStructure = editable && (canAddDatabaseProperties ?? true)
  const canUsePropertyMenus =
    Boolean(databaseId) && (headerMenusEnabled ?? editable)
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((person) => [person.id, person.name])),
    [personOptions]
  )
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
      color: getNextDatabaseOptionColor(options.length),
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
  const cardDrag = useDatabaseKanbanCardDrag({
    addDraggedPageRow,
    allRows,
    databaseId,
    editable,
    getOptionItems: getKanbanOptionItems,
    groupProperty,
    isSorted: isKanbanSorted,
    options: kanbanOptions,
    propertyValuesByKey,
    saveDatabaseSorts,
  })
  const renderCardProperty = (
    row: DatabaseRow,
    property: DatabasePropertyListItem,
    disabledSelect = false
  ) => {
    const pageProperty = property.property
    const key = `${row.pageId}:${pageProperty.id}`
    const persistedValue = propertyValuesByKey[key] ?? ""
    const wrapContent =
      layoutSettings.wrapAllContent || getPropertyWrapContent(pageProperty.config)
    const isGrouped = groupProperty?.property.id === pageProperty.id
    const propertyMenuKey = `${row.pageId}:${property.id}`
    const PropertyIcon = getDatabasePropertyType(pageProperty.type).icon
    const propertyLabel = showPropertyTitles ? (
      canUsePropertyMenus && databaseId ? (
        <DatabasePropertyMenu
          config={pageProperty.config}
          databaseConfig={databaseConfig}
          databaseId={databaseId}
          databasePropertyId={property.id}
          isGrouped={isGrouped}
          name={pageProperty.name}
          onInsertProperty={(side) =>
            addDatabaseProperty(
              undefined,
              undefined,
              side === "left" ? property.position : property.position + 1
            )
          }
          onOpenChange={(open) =>
            setEditingPropertyKey(open ? propertyMenuKey : null)
          }
          onRename={(name) => renameDatabaseProperty(property.id, name)}
          onSort={(direction) =>
            void saveDatabaseSorts([
              ...activeDatabaseSorts.filter((sort) => sort.column !== property.id),
              { column: property.id, direction },
            ])
          }
          onToggleGroup={() =>
            setViewGroupProperty(isGrouped ? null : pageProperty.id)
          }
          onUpdateConfig={(config) =>
            void updateDatabasePropertyConfig(property.id, config)
          }
          open={editingPropertyKey === propertyMenuKey}
          schemaActionsEnabled={canEditStructure}
          sourceDatabaseId={databaseId}
          sourceDatabaseName={databaseName}
          sourcePropertyId={pageProperty.id}
          type={pageProperty.type}
          workspaceId={workspaceId ?? databaseWorkspaceId}
        />
      ) : (
        <span className="database-kanban-property-label-content">
          <PropertyIcon className="size-4 shrink-0" />
          <span className="truncate">{pageProperty.name}</span>
        </span>
      )
    ) : null
    const propertyIcon = showPropertyTitles ? null : (
      <span className="database-kanban-property-icon" title={pageProperty.name}>
        <PropertyIcon aria-hidden="true" />
        <span className="sr-only">{pageProperty.name}</span>
      </span>
    )

    return (
      <div
        className="database-kanban-property"
        data-title-hidden={showPropertyTitles ? undefined : "true"}
        key={property.id}
      >
        {propertyLabel ? (
          <div className="database-kanban-property-label">
            {propertyLabel}
          </div>
        ) : null}
        {propertyIcon}
        <div
          className={
            showPropertyTitles
              ? "database-kanban-property-value"
              : "database-kanban-property-value !pl-0"
          }
        >
          <DatabaseCellContent wrapContent={wrapContent}>
            <DatabasePropertyValue
              disabledSelect={disabledSelect}
              editable={editable}
              properties={properties}
              propertyValuesByKey={propertyValuesByKey}
              onPropertyConfigChange={onPropertyConfigChange}
              onSaveValue={savePropertyValue}
              persistedValue={persistedValue}
              personOptions={personOptions}
              property={property}
              row={row}
              titlePropertyLabel={titlePropertyLabel}
            />
          </DatabaseCellContent>
        </div>
      </div>
    )
  }
  return (
    <>
      <div
        className="database-kanban-wrap database-inline-scroll-wrap"
        data-inline-scroll={isInlineKanbanScrollEnabled ? "true" : undefined}
        data-wrap-content={layoutSettings.wrapAllContent ? "true" : undefined}
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
                  cardDrag.dropTarget?.optionId === option.id &&
                  (cardDrag.isExternalDragActive ||
                    cardDrag.getMove(cardDrag.dropTarget))
                    ? cardDrag.dropTarget
                    : null

                return (
                  <section
                    className="database-kanban-column"
                    key={option.id}
                    onDragLeave={(event) => cardDrag.leave(option, event)}
                    onDragOver={(event) => cardDrag.dragOver(option, event)}
                    onDrop={(event) => cardDrag.drop(option, event)}
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
                            cardDrag.draggedCard?.rowId === item.id
                              ? "true"
                              : undefined
                          }
                          draggable={editable}
                          key={item.id}
                          onDragEnd={cardDrag.clearDrag}
                          onDragStart={(event) =>
                            cardDrag.startDrag(item, option, event)
                          }
                          onPointerDownCapture={cardDrag.captureDragOrigin}
                        >
                          <div className="database-kanban-card-title">
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
                        <div
                          aria-hidden="true"
                          className="drag-drop-line database-kanban-card-drop-line"
                          data-orientation="horizontal"
                        />
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
                          <Plus />
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
                      {isCreatingKanbanOption ? (
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
        open={cardDrag.pendingSortedMove !== null}
        onOpenChange={(open) => {
          if (!open) {
            cardDrag.setPendingSortedMove(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
            <AlertDialogDescription>
              Row order is manual. To save this move, Zilobase needs to clear the
              active sorting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={cardDrag.confirmSortedMove}>
              Clear sorting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
