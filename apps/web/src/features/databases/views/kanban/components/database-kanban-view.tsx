import { DatabaseKanbanGroupDialogs, useKanbanGroupActions } from "./database-kanban-group-actions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus } from "@/shared/components/icons";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import {
  getNextDatabaseOptionColor,
  getDatabasePropertyType,
} from "../../../schema/property-catalog";
import { DatabasePropertyDate } from "../../../schema/editors/database-property-date";
import { DatabasePropertyInput } from "../../../schema/editors/database-property-input";
import { DatabasePropertyMenu } from "../../../schema/editors/database-property-menu";
import { DatabasePropertyValue } from "../../../schema/editors/database-property-value";
import { DatabaseCellContent } from "../../components/database-cell-content";
import {
  firstScalarValue,
  type DatabasePropertyValue as DatabaseCellValue,
} from "../../../schema/property-values";
import { getMergedPropertyConfig, getPropertyWrapContent } from "../../model/database-view-config";
import { useInlineDatabaseScroll } from "../../../interactions/use-inline-database-scroll";
import {
  type DatabasePropertyListItem,
  canCreateKanbanGroup,
  isOptionBackedKanbanGroupProperty,
} from "../model/database-kanban-config";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/database-view-context";
import { useDatabaseRowsScroll } from "../../../interactions/use-database-rows-scroll";
import { NameColumnGlyph } from "../../../interactions/name-column-glyph";
import { useKanbanEdgeScroll } from "../controller/use-kanban-edge-scroll";
import { useDatabaseKanbanCardDrag } from "../controller/use-database-kanban-card-drag";
import { useKanbanMoves } from "../controller/use-kanban-moves";
import { buildKanbanBoard } from "../model/database-kanban-board";
import { DatabaseKanbanColumn } from "./database-kanban-column";
import { getKanbanBoardContentWidth } from "../layout/database-kanban-layout";
import {
  getUntitledKanbanGroupName,
  getKanbanGroupLabel,
  getSelectOptionSort,
  getSortedSelectOptions,
  type DatabaseRow,
  type KanbanGroupOption,
} from "../model/database-kanban-group-model";

const NEW_KANBAN_GROUP_TRIGGER_SELECTOR =
  ".database-input-cell-trigger, .database-date-cell-trigger";

export function DatabaseKanbanView() {
  const { databaseId, hostDatabaseId, groupProperty } = useDatabaseDataContext();
  const { activeView } = useDatabaseUiContext();
  // A new surface gets fresh interaction state; already submitted writes finish
  // against the scope captured by their owner.
  const scope = JSON.stringify([hostDatabaseId, databaseId, activeView?.id, groupProperty?.id]);
  return <DatabaseKanbanBoard key={scope} />;
}

function DatabaseKanbanBoard() {
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
  } = useDatabaseActionsContext();
  const {
    activeDatabaseSorts,
    propertyValuesByKey: savedPropertyValues,
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
    items: savedRows,
    sortedItems: savedVisibleRows,
    visibleProperties,
    workspaceId,
    options,
  } = useDatabaseDataContext();
  const {
    headerMenusEnabled,
    layoutSettings,
    showPageIconInTitle,
    showPropertyTitles,
    titlePropertyLabel,
  } = useDatabaseUiContext();
  const moves = useKanbanMoves({
    databaseId,
    hostDatabaseId,
  });
  const allRows = savedRows;
  const items = savedVisibleRows;
  const propertyValuesByKey = savedPropertyValues;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const newGroupRef = useRef<HTMLElement | null>(null);
  const [isNewGroupDropActive, setIsNewGroupDropActive] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  useKanbanEdgeScroll(scrollRef, editable && Boolean(groupProperty));
  const [newKanbanOptionName, setNewKanbanOptionName] = useState("");
  const [temporaryKanbanOptions, setTemporaryKanbanOptions] = useState<KanbanGroupOption[]>([]);
  const [isCreatingKanbanOption, setIsCreatingKanbanOption] = useState(false);
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(null);
  const isKanbanSorted = activeDatabaseSorts.length > 0;
  const canEditStructure = editable && (canAddDatabaseProperties ?? true);
  const canUsePropertyMenus = Boolean(databaseId) && (headerMenusEnabled ?? editable);
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((person) => [person.id, person.name])),
    [personOptions],
  );
  const board = useMemo(
    () =>
      buildKanbanBoard({
        groupProperty,
        items,
        options,
        personOptionsById,
        propertyValuesByKey,
        temporaryKanbanOptions,
      }),
    [groupProperty, items, options, personOptionsById, propertyValuesByKey, temporaryKanbanOptions],
  );
  const kanbanOptions = board.options;
  const groupActions = useKanbanGroupActions(kanbanOptions);
  useEffect(() => {
    setTemporaryKanbanOptions([]);
  }, [groupProperty?.id]);
  const getInlineKanbanContentWidth = useCallback(() => {
    const boardElement = boardRef.current;

    return boardElement ? getKanbanBoardContentWidth(boardElement) : 0;
  }, []);
  const { isInlineScrollEnabled: isInlineKanbanScrollEnabled, style: kanbanWrapStyle } =
    useInlineDatabaseScroll({
      contentRef: boardRef,
      enabled: Boolean(groupProperty),
      getContentWidth: getInlineKanbanContentWidth,
      measureKey: `${kanbanOptions.length}:${editable}`,
      scrollRef,
      wrapperRef: wrapRef,
    });
  const { sentinelRef: rowsScrollSentinelRef } = useDatabaseRowsScroll({
    enabled: Boolean(groupProperty),
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  });

  const createKanbanOption = async (nextOptionName = newKanbanOptionName) => {
    const optionName = nextOptionName.trim();

    if (
      !groupProperty ||
      !optionName ||
      !canCreateKanbanGroup(groupProperty) ||
      isCreatingKanbanOption
    ) {
      if (!optionName) cardDrag.cancelNewGroupDrop();
      setNewKanbanOptionName("");
      return;
    }

    const normalizedOptionName = optionName.toLowerCase();
    const matchingOption = kanbanOptions.find(
      (option) =>
        option.name.toLowerCase() === normalizedOptionName ||
        option.groupValue.toLowerCase() === normalizedOptionName,
    );

    if (matchingOption) {
      await cardDrag.completeNewGroupDrop(matchingOption);
      setNewKanbanOptionName("");
      return;
    }

    if (!isOptionBackedKanbanGroupProperty(groupProperty)) {
      const temporaryOption: KanbanGroupOption = {
        groupValue: optionName,
        id: `temporary-${crypto.randomUUID()}`,
        isTemporary: true,
        name: getKanbanGroupLabel({
          groupValue: optionName,
          personOptionsById,
          property: groupProperty,
        }),
      };
      setTemporaryKanbanOptions((currentOptions) => [...currentOptions, temporaryOption]);
      await cardDrag.completeNewGroupDrop(temporaryOption);
      setNewKanbanOptionName("");
      return;
    }

    const createdOption = {
      color: getNextDatabaseOptionColor(options.length),
      id: crypto.randomUUID(),
      name: optionName,
    };
    const nextOptions = [...options, createdOption];
    const sortedOptions = getSortedSelectOptions(
      nextOptions,
      getSelectOptionSort(groupProperty.property.config),
    );

    setIsCreatingKanbanOption(true);

    try {
      await updateDatabasePropertyConfig(
        groupProperty.id,
        getMergedPropertyConfig(groupProperty.property.config, {
          options: sortedOptions,
        }),
      );
      await cardDrag.completeNewGroupDrop({ ...createdOption, groupValue: optionName });
      setNewKanbanOptionName("");
    } catch {
      toast.error("Couldn't create group");
    } finally {
      setIsCreatingKanbanOption(false);
    }
  };

  const createKanbanDateGroup = (value: DatabaseCellValue) => {
    const nextValue = firstScalarValue(value);

    setNewKanbanOptionName(nextValue);

    if (nextValue.trim()) {
      void createKanbanOption(nextValue);
    }
  };

  const onPropertyConfigChange = (databasePropertyId: string, config: unknown) =>
    updateDatabasePropertyConfig(databasePropertyId, config);
  const getKanbanOptionItems = useCallback(
    (option: KanbanGroupOption) => board.rowsByGroupValue.get(option.groupValue) ?? [],
    [board.rowsByGroupValue],
  );
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
    submitMove: moves.submitMove,
  });
  const renderCardProperty = (
    row: DatabaseRow,
    property: DatabasePropertyListItem,
    disabledSelect = false,
  ) => {
    const pageProperty = property.property;
    const key = `${row.pageId}:${pageProperty.id}`;
    const persistedValue = propertyValuesByKey[key] ?? "";
    const wrapContent =
      layoutSettings.wrapAllContent || getPropertyWrapContent(pageProperty.config);
    const isGrouped = groupProperty?.property.id === pageProperty.id;
    const propertyMenuKey = `${row.pageId}:${property.id}`;
    const PropertyIcon = getDatabasePropertyType(pageProperty.type).icon;
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
              side === "left" ? property.position : property.position + 1,
            )
          }
          onOpenChange={(open) => setEditingPropertyKey(open ? propertyMenuKey : null)}
          onRename={(name) => renameDatabaseProperty(property.id, name)}
          onSort={(direction) =>
            void saveDatabaseSorts([
              ...activeDatabaseSorts.filter((sort) => sort.column !== property.id),
              { column: property.id, direction },
            ])
          }
          onToggleGroup={() => setViewGroupProperty(isGrouped ? null : pageProperty.id)}
          onUpdateConfig={(config) => void updateDatabasePropertyConfig(property.id, config)}
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
    ) : null;
    const propertyIcon = showPropertyTitles ? null : (
      <span className="database-kanban-property-icon" title={pageProperty.name}>
        <PropertyIcon aria-hidden="true" />
        <span className="sr-only">{pageProperty.name}</span>
      </span>
    );

    return (
      <div
        className="database-kanban-property"
        data-title-hidden={showPropertyTitles ? undefined : "true"}
        key={property.id}
      >
        {propertyLabel ? (
          <div className="database-kanban-property-label">{propertyLabel}</div>
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
    );
  };
  function renderNewGroup() {
    if (!groupProperty) return null;
    return editable && canCreateKanbanGroup(groupProperty) ? (
      <section
        className="database-kanban-column database-kanban-new-column"
        ref={newGroupRef}
        data-drop-active={isNewGroupDropActive ? "true" : undefined}
        onDragOver={(event) => {
          if (isCreatingKanbanOption || !cardDrag.canDropOnNewGroup(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setIsNewGroupDropActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setIsNewGroupDropActive(false);
        }}
        onDrop={(event) => {
          setIsNewGroupDropActive(false);
          if (isCreatingKanbanOption || !cardDrag.dropOnNewGroup(event)) return;
          requestAnimationFrame(() => {
            newGroupRef.current
              ?.querySelector<HTMLElement>(NEW_KANBAN_GROUP_TRIGGER_SELECTOR)
              ?.click();
          });
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
                return;
              }

              event.currentTarget
                .querySelector<HTMLElement>(NEW_KANBAN_GROUP_TRIGGER_SELECTOR)
                ?.click();
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
                  if (!open) cardDrag.cancelNewGroupDrop();
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
                  cardDrag.cancelNewGroupDrop();
                  setNewKanbanOptionName("");
                }}
                onCommit={() => {
                  void createKanbanOption(
                    newKanbanOptionName.trim() ||
                      (groupProperty.property.type === "number"
                        ? ""
                        : getUntitledKanbanGroupName(kanbanOptions)),
                  );
                }}
                type="text"
                value={newKanbanOptionName}
              />
            )}
          </div>
        </div>
        <div className="database-kanban-cards" />
      </section>
    ) : null;
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
                  : getDatabasePropertyType(property.property.type).icon;

              return (
                <SelectItem key={property.id} value={property.property.id}>
                  {PropertyIcon ? (
                    <PropertyIcon className="size-4 shrink-0 text-content-secondary" />
                  ) : (
                    <NameColumnGlyph />
                  )}
                  <span>{property.property.name}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return renderBoard();

  function renderHiddenGroupsButton() {
    return editable && groupActions.settings.hiddenGroupIds.length > 0 ? (
      <button
        type="button"
        className="h-11 shrink-0 px-3 text-sm text-content-secondary hover:text-content-primary"
        onClick={() => groupActions.setEditing(true)}
      >
        Edit groups
      </button>
    ) : null;
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
            <div className="database-kanban-scroll database-inline-scroll" ref={scrollRef}>
              <div className="database-kanban-scroll-content database-inline-scroll-content">
                <div
                  className="database-kanban-board"
                  data-move-pending={moves.isPending ? "true" : undefined}
                  data-drag-active={cardDrag.isDragging ? "true" : undefined}
                  onDragEndCapture={() => setIsNewGroupDropActive(false)}
                  ref={boardRef}
                >
                  {kanbanOptions
                    .filter((option) => !groupActions.settings.hiddenGroupIds.includes(option.id))
                    .map((option) => (
                      <DatabaseKanbanColumn
                        key={option.id}
                        option={option}
                        items={getKanbanOptionItems(option)}
                        cardDrag={cardDrag}
                        groupProperty={groupProperty}
                        groupActions={groupActions}
                        editable={editable}
                        databaseId={databaseId}
                        addDatabaseRow={addDatabaseRow}
                        onOpenPage={onOpenPage}
                        showPageIconInTitle={showPageIconInTitle}
                        visibleProperties={visibleProperties}
                        renderCardProperty={renderCardProperty}
                      />
                    ))}
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
            if (!open && !cardDrag.isClearingSort) {
              cardDrag.setPendingSortedMove(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
              <AlertDialogDescription>
                Row order is manual. To save this move, Zilobase needs to clear the active sorting
                first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cardDrag.isClearingSort}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={cardDrag.isClearingSort}
                onClick={(event) => {
                  event.preventDefault();
                  void cardDrag.confirmSortedMove();
                }}
              >
                {cardDrag.isClearingSort ? "Clearing…" : "Clear sorting"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
}
