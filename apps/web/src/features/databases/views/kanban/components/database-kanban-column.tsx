import type { ReactNode } from "react";
import { Plus } from "@/shared/components/icons";
import {
  getColorToken,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/shared/lib/color-tokens";
import { DatabasePageLink } from "../../../interactions/database-page-link";
import {
  canCreateRowInGroup,
  type DatabasePropertyListItem,
} from "../../model/database-group-config";
import type { DatabaseRow, KanbanGroupOption } from "../model/database-kanban-group-model";
import type { useDatabaseKanbanCardDrag } from "../controller/use-database-kanban-card-drag";
import {
  DatabaseKanbanGroupActions,
  type useKanbanGroupActions,
} from "./database-kanban-group-actions";
import type { DatabaseViewProviderValue } from "../../state/database-view-context";

export function DatabaseKanbanColumn({
  option,
  items,
  cardDrag,
  groupProperty,
  groupActions,
  editable,
  databaseId,
  addDatabaseRow,
  onOpenPage,
  showPageIconInTitle,
  visibleProperties,
  renderCardProperty,
}: {
  option: KanbanGroupOption;
  items: DatabaseRow[];
  cardDrag: ReturnType<typeof useDatabaseKanbanCardDrag<DatabaseRow, KanbanGroupOption>>;
  groupProperty: DatabasePropertyListItem;
  groupActions: ReturnType<typeof useKanbanGroupActions>;
  editable: boolean;
  databaseId: string | null | undefined;
  addDatabaseRow: DatabaseViewProviderValue["addDatabaseRow"];
  onOpenPage: DatabaseViewProviderValue["onOpenPage"];
  showPageIconInTitle: boolean;
  visibleProperties: DatabasePropertyListItem[];
  renderCardProperty: (
    row: DatabaseRow,
    property: DatabasePropertyListItem,
    disabled: boolean,
  ) => ReactNode;
}) {
  const isEmptyOption = option.isEmpty === true;
  const optionItems = items;
  const preview = cardDrag.getPreview(option);
  const colorToken = getColorToken(option.color);
  const canAddPageToOption = !isEmptyOption && canCreateRowInGroup(groupProperty);
  const activeCardDropTarget =
    cardDrag.dropTarget?.optionId === option.id && cardDrag.isExternalDragActive
      ? cardDrag.dropTarget
      : null;

  const groupPropertyId = groupProperty.property.id;
  const showAddCard = editable && canAddPageToOption;
  function renderColumnCards() {
    return (
      <div
        className="database-kanban-cards"
        ref={cardDrag.getColumnRef(option.id)}
        style={
          preview
            ? {
                paddingBottom: `calc(var(--spacing) * 2 + ${Math.max(0, preview.heightDelta)}px)`,
              }
            : undefined
        }
      >
        {preview?.placeholderTop != null ? (
          <div
            aria-hidden="true"
            className="database-kanban-card-placeholder"
            style={{
              top: preview.placeholderTop + preview.paddingTop,
              height: preview.height,
            }}
          />
        ) : null}
        {optionItems.map((item: DatabaseRow, index: number) => (
          <article
            className="database-kanban-card"
            data-database-row-id={item.id}
            style={preview ? { transform: `translateY(${preview.offsets[index]}px)` } : undefined}
            data-drop-before={activeCardDropTarget?.targetIndex === index ? "true" : undefined}
            data-dragging={preview?.hiddenIndex === index ? "true" : undefined}
            draggable={editable}
            key={item.id}
            onDragEnd={cardDrag.clearDrag}
            onDragStartCapture={(event) => cardDrag.startDrag(item, option, event)}
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
                {visibleProperties.map((property: DatabasePropertyListItem) =>
                  renderCardProperty(
                    item,
                    property,
                    isEmptyOption && property.property.id === groupPropertyId,
                  ),
                )}
              </div>
            ) : null}
          </article>
        ))}
        {activeCardDropTarget?.targetIndex === optionItems.length ? (
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
            onClick={() => addDatabaseRow(option.groupValue, groupProperty)}
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
        <span className={getColorTokenBadgeClassName(option.color)}>
          {option.color ? (
            <span aria-hidden="true" className={getColorTokenDotClassName(option.color)} />
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
}
