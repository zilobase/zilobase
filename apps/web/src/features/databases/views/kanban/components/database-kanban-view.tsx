import { DatabaseKanbanGroupActions, DatabaseKanbanGroupDialogs, useKanbanGroupActions } from "./database-kanban-group-actions"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Loader2, Plus } from "@/shared/components/icons"
import { toast } from "sonner"
import {
  getColorToken,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/shared/lib/color-tokens"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  getNextDatabaseOptionColor,
  getDatabasePropertyType,
} from "../../../schema/property-catalog"
import { DatabasePropertyDate } from "../../../schema/editors/database-property-date"
import { DatabasePropertyInput } from "../../../schema/editors/database-property-input"
import { DatabasePageLink } from "../../../interactions/database-page-link"
import { DatabasePropertyMenu } from "../../../schema/editors/database-property-menu"
import { DatabasePropertyValue } from "../../../schema/editors/database-property-value"
import { DatabaseCellContent } from "../../components/database-cell-content"
import {
  firstScalarValue,
  type DatabasePropertyValue as DatabaseCellValue,
} from "../../../schema/property-values"
import {
  getMergedPropertyConfig,
  getPropertyWrapContent,
} from "../../model/database-view-config"
import {
  useInlineDatabaseScroll,
} from "../../../interactions/use-inline-database-scroll"
import {
  type DatabasePropertyListItem,
  canCreateKanbanGroup,
  canCreateRowInKanbanGroup,
  isOptionBackedKanbanGroupProperty,
} from "../model/database-kanban-config"
import { useDatabaseActionsContext, useDatabaseDataContext, useDatabaseUiContext } from "../../state/database-view-context"
import { useDatabaseRowsScroll } from "../../../interactions/use-database-rows-scroll"
import { NameColumnGlyph } from "../../../interactions/name-column-glyph"
import { useKanbanEdgeScroll } from "../controller/use-kanban-edge-scroll"
import { useDatabaseKanbanCardDrag } from "../controller/use-database-kanban-card-drag"
import { getKanbanBoardContentWidth } from "../layout/database-kanban-layout"
import {
  getDerivedKanbanGroupId,
  getUntitledKanbanGroupName,
  getKanbanGroupLabel,
  getKanbanGroupValues,
  getSelectOptionSort,
  getSortedSelectOptions,
  type DatabaseRow,
  type KanbanGroupOption,
} from "../model/database-kanban-group-model"

const NEW_KANBAN_GROUP_TRIGGER_SELECTOR =
  ".database-input-cell-trigger, .database-date-cell-trigger"

export function DatabaseKanbanView() {
  const {
    fetchNextPage,
    addDatabaseRow,
    addDraggedPageRow,
    onOpenPage,
    savePropertyValue,
    setViewGroupProperty,
    saveDatabaseSorts,
    renameDatabaseProperty,
    updateDatabasePropertyConfig,
    addDatabaseProperty,
  } = useDatabaseActionsContext()
  const {
    activeDatabaseSorts,
    propertyValuesByKey,
    canAddDatabaseProperties,
    databaseConfig,
    databaseId,
    databaseName,
    databaseWorkspaceId,
    editable,
    groupProperty,
    groupableProperties,
    hasNextPage,
    hostDatabaseId,
    isFetchingNextPage,
    personOptions,
    properties,
    items: allRows,
    sortedItems: items,
    visibleProperties,
    workspaceId,
    options,
  } = useDatabaseDataContext()
  const {
    headerMenusEnabled,
    layoutSettings,
    showPageIconInTitle,
    showPropertyTitles,
    titlePropertyLabel,
  } = useDatabaseUiContext()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const newGroupRef = useRef<HTMLElement | null>(null)
  const [isNewGroupDropActive, setIsNewGroupDropActive] = useState(false)
  const boardRef = useRef<HTMLDivElement | null>(null)
  useKanbanEdgeScroll(scrollRef, editable && Boolean(groupProperty))
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
  const groupActions = useKanbanGroupActions(kanbanOptions)
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
      if (!optionName) cardDrag.cancelNewGroupDrop()
      setNewKanbanOptionName("")
      return
    }

    const normalizedOptionName = optionName.toLowerCase()
    const matchingOption = kanbanOptions.find(
      (option) =>
        option.name.toLowerCase() === normalizedOptionName ||
        option.groupValue.toLowerCase() === normalizedOptionName
    )

    if (matchingOption) {
      await cardDrag.completeNewGroupDrop(matchingOption)
      setNewKanbanOptionName("")
      return
    }

    if (!isOptionBackedKanbanGroupProperty(groupProperty)) {
      const temporaryOption: KanbanGroupOption = {
        groupValue: optionName,
        id: `temporary-${crypto.randomUUID()}`,
        isTemporary: true,
        name: getKanbanGroupLabel({ groupValue: optionName, personOptionsById, property: groupProperty }),
      }
      setTemporaryKanbanOptions((currentOptions) => [...currentOptions, temporaryOption])
      await cardDrag.completeNewGroupDrop(temporaryOption)
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
      await cardDrag.completeNewGroupDrop({ ...createdOption, groupValue: optionName })
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
    hostDatabaseId,
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
  function renderNewGroup() {
    if (!groupProperty) return null
    return (editable && canCreateKanbanGroup(groupProperty) ? (
                <section
                  className="database-kanban-column database-kanban-new-column"
                  ref={newGroupRef}
                  data-drop-active={isNewGroupDropActive ? "true" : undefined}
                  onDragOver={(event) => {
                    if (isCreatingKanbanOption || !cardDrag.canDropOnNewGroup(event)) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = "move"
                    setIsNewGroupDropActive(true)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsNewGroupDropActive(false)
                  }}
                  onDrop={(event) => {
                    setIsNewGroupDropActive(false)
                    if (isCreatingKanbanOption || !cardDrag.dropOnNewGroup(event)) return
                    requestAnimationFrame(() => {
                      newGroupRef.current?.querySelector<HTMLElement>(NEW_KANBAN_GROUP_TRIGGER_SELECTOR)?.click()
                    })
                  }}
                >
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
                          onOpenChange={(open) => {
                            if (!open) cardDrag.cancelNewGroupDrop()
                          }}
                          onSelect={createKanbanDateGroup}
                          propertyConfig={groupProperty.property.config}
                          value={newKanbanOptionName}
                        />
                      ) : (
                        <DatabasePropertyInput
                          editable={!isCreatingKanbanOption}
                          label="New group"
                          onChange={setNewKanbanOptionName}
                          onCancel={() => {
                            cardDrag.cancelNewGroupDrop()
                            setNewKanbanOptionName("")
                          }}
                          onCommit={() => {
                            void createKanbanOption(
                              newKanbanOptionName.trim() ||
                                (groupProperty.property.type === "number"
                                  ? ""
                                  : getUntitledKanbanGroupName(kanbanOptions)),
                            )
                          }}
                          type="text"
                          value={newKanbanOptionName}
                        />
                      )}
                    </div>
                  </div>
                  <div className="database-kanban-cards" />
                </section>
              ) : null)
  }
  function renderEmptyBoard() {
    return (
        <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-sm text-content-secondary">
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
                      <PropertyIcon className="size-4 shrink-0 text-content-secondary" />
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
    )
  }
  return renderBoard()

  function externalDropTarget(optionId: string) {
    return cardDrag.dropTarget?.optionId === optionId && cardDrag.isExternalDragActive ? cardDrag.dropTarget : null
  }
  function renderHiddenGroupsButton() {
    return (editable && groupActions.settings.hiddenGroupIds.length > 0 ? (
                <button type="button" className="h-11 shrink-0 px-3 text-sm text-content-secondary hover:text-content-primary" onClick={() => groupActions.setEditing(true)}>Edit groups</button>
              ) : null)
  }
  function renderBoard() {
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
            <div
              className="database-kanban-board"
              data-drop-settling={cardDrag.isDropSettling ? "true" : undefined}
              onDragEndCapture={() => setIsNewGroupDropActive(false)}
              ref={boardRef}
            >
              {kanbanOptions.filter((option) => !groupActions.settings.hiddenGroupIds.includes(option.id)).map((option) => {
                const isEmptyOption = option.isEmpty === true
                const optionItems = cardDrag.getRenderedItems(option)
                const preview = cardDrag.getPreview(option)
                const colorToken = getColorToken(option.color)
                const canAddPageToOption =
                  !isEmptyOption && canCreateRowInKanbanGroup(groupProperty)
                const activeCardDropTarget =
                  externalDropTarget(option.id)

                const groupPropertyId = groupProperty.property.id;
                const showAddCard = editable && canAddPageToOption;
                function renderColumnCards() {
                  return (
                    <div
                      className="database-kanban-cards"
                      ref={cardDrag.getColumnRef(option.id)}
                      style={preview ? {
                        paddingBottom: `calc(var(--spacing) * 2 + ${Math.max(0, preview.heightDelta)}px)`,
                      } : undefined}
                    >
                      {preview?.placeholderTop != null ? (
                        <div
                          aria-hidden="true"
                          className="database-kanban-card-placeholder"
                          style={{ top: preview.placeholderTop + preview.paddingTop, height: preview.height }}
                        />
                      ) : null}
                      {optionItems.map((item: DatabaseRow, index: number) => (
                        <article
                          className="database-kanban-card"
                          data-database-row-id={item.id}
                          style={preview ? { transform: `translateY(${preview.offsets[index]}px)` } : undefined}
                          data-drop-before={
                            activeCardDropTarget?.targetIndex === index
                              ? "true"
                              : undefined
                          }
                          data-dragging={
                            preview?.hiddenIndex === index
                              ? "true"
                              : undefined
                          }
                          draggable={editable}
                          key={item.id}
                          onDragEnd={cardDrag.clearDrag}
                          onDragStartCapture={(event) =>
                            cardDrag.startDrag(item, option, event)
                          }
                          onPointerDownCapture={cardDrag.captureDragOrigin}
                          ref={cardDrag.getCardRef(option.id, item.id)}
                        >
                          <div className="database-kanban-card-title">
                            <DatabasePageLink
                              editable={editable}
                              onOpen={onOpenPage}
                              pageId={item.pageId}
                              pageSummary={item.page}
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
                                      property.property.id === groupPropertyId,
                                  ),
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
                      {showAddCard ? (
                        <button
                          className="database-kanban-new-card"
                          style={preview ? { transform: `translateY(${preview.heightDelta}px)` } : undefined}
                          disabled={!databaseId}
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
                  );
                }

                return (
                  <section
                    className="database-kanban-column"
                    data-color-token={colorToken.value ?? undefined}
                    data-option-id={option.id}
                    data-drop-active={preview?.placeholderTop != null ? "true" : undefined}
                    key={option.id}
                    onDragLeave={(event) => cardDrag.leave(option, event)}
                    onDragOver={(event) => cardDrag.dragOver(option, event)}
                    onDrop={(event) => cardDrag.drop(option, event)}
                  >
                    <div className="database-kanban-column-header">
                      <span
                        className={getColorTokenBadgeClassName(option.color)}
                      >
                        {option.color ? (
                          <span
                            aria-hidden="true"
                            className={getColorTokenDotClassName(option.color)}
                          />
                        ) : null}
                        {option.name}
                      </span>
                      {!groupActions.settings.hiddenCountGroupIds.includes(option.id) ? (
                        <span className="database-kanban-count">{optionItems.length}</span>
                      ) : null}
                      <DatabaseKanbanGroupActions
                        option={option}
                        actions={groupActions}
                        canAdd={canAddPageToOption}
                        adding={!databaseId}
                        onAdd={() => addDatabaseRow(option.groupValue, groupProperty)}
                      />
                    </div>
                    {renderColumnCards()}
                  </section>
                );
              })}
              {renderHiddenGroupsButton()}
              {renderNewGroup()}
            </div>
            {hasNextPage || isFetchingNextPage ? (
              <div
                aria-hidden={!isFetchingNextPage}
                className="database-rows-pagination-status flex items-center justify-center gap-2 px-4 py-3 text-sm text-content-secondary"
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
        renderEmptyBoard()
      )}
      </div>
      <DatabaseKanbanGroupDialogs actions={groupActions} />
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
}
