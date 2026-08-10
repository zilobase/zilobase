import { useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Loader2,
  Plus,
} from "lucide-react"
import {
  getPageCover,
  getPageEmoji,
  type PageMetadata,
} from "@zilobase/features/pages"

import { PageIconDisplay } from "@/lib/page-icon"
import {
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"
import { getDatabaseTableGroupSections } from "../../interactions/database-table-group-sections"
import { useDatabaseRowsScroll } from "../../interactions/use-database-rows-scroll"
import { canCreateRowInKanbanGroup } from "../kanban/database-kanban-config"
import { useDatabaseViewContext } from "../database-view-context"
import { DatabasePropertyValue } from "../../properties/database-property-value"
import { DatabaseCellContent } from "../database-cell-content"
import { useDatabaseGalleryCardDrag } from "./use-database-gallery-card-drag"

export function DatabaseGalleryView() {
  const {
    addDraggedPageRow,
    addDatabaseRow,
    databaseId,
    editable,
    fetchNextPage,
    groupProperty,
    hasNextPage,
    isAddingDatabaseRow,
    isFetchingNextPage,
    items,
    layoutSettings,
    onOpenPage,
    personOptions,
    properties,
    propertyValuesByKey,
    savePropertyValue,
    showPageIconInTitle,
    sortedItems,
    titlePropertyLabel,
    updateDatabasePropertyConfig,
    visibleProperties,
  } = useDatabaseViewContext()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  )
  const rows = useMemo(() => {
    const rowsById = new Map(items.map((row) => [row.id, row]))

    return sortedItems.flatMap((item) => {
      const row = rowsById.get(item.id)
      return row ? [row] : []
    })
  }, [items, sortedItems])
  const personOptionsById = useMemo(
    () => new Map(personOptions.map((person) => [person.id, person.name])),
    [personOptions],
  )
  const groupedSections = useMemo(
    () =>
      getDatabaseTableGroupSections({
        groupProperty,
        personOptionsById,
        propertyValuesByKey,
        rows,
      }),
    [groupProperty, personOptionsById, propertyValuesByKey, rows],
  )
  const { sentinelRef } = useDatabaseRowsScroll({
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  })
  const cardDrag = useDatabaseGalleryCardDrag({
    addDraggedPageRow,
    databaseId,
    editable,
    groupProperty,
    groupedSections,
    items,
    visibleRows: rows,
  })
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)

      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }

      return next
    })
  }
  const renderCard = (
    row: (typeof items)[number],
    rowIndex: number,
    sectionId: string | null,
    sectionRowCount: number,
  ) => {
    const emoji = getPageEmoji({
      metadata: row.page.metadata as PageMetadata | null | undefined,
    })
    const cover = getPageCover({
      metadata: row.page.metadata as PageMetadata | null | undefined,
    })

    return (
      <article
        className="database-gallery-card"
        data-dragging={cardDrag.draggedRowId === row.id ? "true" : undefined}
        data-drop-after={
          (cardDrag.draggedRowId || cardDrag.isExternalDragActive) &&
          cardDrag.dropTarget?.sectionId === sectionId &&
          cardDrag.dropTarget.targetIndex === rowIndex + 1 &&
          rowIndex === sectionRowCount - 1
            ? "true"
            : undefined
        }
        data-drop-before={
          (cardDrag.draggedRowId || cardDrag.isExternalDragActive) &&
          cardDrag.dropTarget?.sectionId === sectionId &&
          cardDrag.dropTarget.targetIndex === rowIndex
            ? "true"
            : undefined
        }
        key={row.id}
        onDragOver={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          cardDrag.dragOver(
            event,
            sectionId,
            event.clientY < rect.top + rect.height / 2
              ? rowIndex
              : rowIndex + 1,
          )
        }}
        onDrop={(event) => cardDrag.drop(event, sectionId, rowIndex)}
      >
        {editable ? (
          <button
            aria-label={`Drag ${row.page.name?.trim() || "Untitled"}`}
            className="database-gallery-card-drag-handle"
            draggable
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onDragEnd={cardDrag.clearDrag}
            onDragStart={(event) => cardDrag.startDrag(row, event)}
            title="Drag page"
            type="button"
          >
            <GripVertical />
          </button>
        ) : null}
        {layoutSettings.cardPreview === "page-cover" ? (
          <button
            aria-label={`Open ${row.page.name?.trim() || "Untitled"}`}
            className="database-gallery-preview"
            data-open-in-new-tab-href={`/p/${encodeURIComponent(row.pageId)}`}
            data-open-in-new-tab-title={row.page.name?.trim() || "Untitled"}
            onClick={() => onOpenPage?.(row.pageId, { databaseId })}
            type="button"
          >
            {cover ? (
              <img
                alt=""
                className="database-gallery-preview-image"
                src={cover}
              />
            ) : null}
          </button>
        ) : null}
        <div className="database-gallery-card-content">
          <button
            className="database-gallery-card-title"
            data-open-in-new-tab-href={`/p/${encodeURIComponent(row.pageId)}`}
            data-open-in-new-tab-title={row.page.name?.trim() || "Untitled"}
            onClick={() => onOpenPage?.(row.pageId, { databaseId })}
            type="button"
          >
            {showPageIconInTitle ? (
              <span className="database-gallery-card-icon">
                {emoji ? (
                  <PageIconDisplay size="sm" value={emoji} />
                ) : (
                  <FileText />
                )}
              </span>
            ) : null}
            <span>{row.page.name?.trim() || "Untitled"}</span>
          </button>
          {visibleProperties.length > 0 ? (
            <div className="database-gallery-card-properties">
              {visibleProperties.map((property) => {
                const key = `${row.pageId}:${property.property.id}`
                const persistedValue = propertyValuesByKey[key] ?? ""

                return (
                  <div
                    className="database-gallery-card-property"
                    data-full-line={
                      layoutSettings.fullLinePropertyIds.includes(property.id)
                        ? "true"
                        : undefined
                    }
                    key={`${row.id}:${property.id}`}
                  >
                    <span className="database-gallery-card-property-label">
                      {property.property.name}
                    </span>
                    <div className="database-gallery-card-property-value">
                      <DatabaseCellContent
                        wrapContent={layoutSettings.wrapAllContent}
                      >
                        <DatabasePropertyValue
                          editable={editable}
                          properties={properties}
                          propertyValuesByKey={propertyValuesByKey}
                          onPropertyConfigChange={(
                            databasePropertyId,
                            config,
                          ) =>
                            updateDatabasePropertyConfig(
                              databasePropertyId,
                              config,
                            )
                          }
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
              })}
            </div>
          ) : null}
        </div>
      </article>
    )
  }
  const renderNewCard = (
    groupValue?: string,
    grouped = false,
  ) =>
    editable && (!grouped || (groupProperty && canCreateRowInKanbanGroup(groupProperty))) ? (
      <button
        className="database-gallery-new-card"
        disabled={!databaseId || isAddingDatabaseRow}
        onClick={() =>
          addDatabaseRow(groupValue, grouped ? groupProperty : undefined)
        }
        type="button"
      >
        <Plus />
        <span>New page</span>
      </button>
    ) : null

  return (
    <div
      className="database-gallery-view"
      data-card-layout={layoutSettings.cardLayout}
      data-card-preview={layoutSettings.cardPreview}
      data-card-size={layoutSettings.cardSize}
      data-wrap-content={layoutSettings.wrapAllContent ? "true" : undefined}
      onDragLeave={cardDrag.leave}
    >
      {groupProperty ? (
        <div className="database-gallery-groups">
          {groupedSections.map((section) => {
            const isCollapsed = collapsedGroups.has(section.id)

            return (
              <section className="database-gallery-group" key={section.id}>
                <button
                  aria-expanded={!isCollapsed}
                  className="database-table-group-toggle"
                  onClick={() => toggleGroup(section.id)}
                  type="button"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 shrink-0" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0" />
                  )}
                  <span className={getColorTokenBadgeClassName(section.color)}>
                    <span
                      aria-hidden="true"
                      className={getColorTokenDotClassName(section.color)}
                    />
                    {section.name}
                  </span>
                  <span className="database-table-group-count">
                    {section.rows.length}
                  </span>
                </button>
                {!isCollapsed ? (
                  <div
                    className="database-gallery-grid"
                    onDragOver={(event) =>
                      cardDrag.dragOver(event, section.id, section.rows.length)
                    }
                    onDrop={(event) =>
                      cardDrag.drop(event, section.id, section.rows.length)
                    }
                  >
                    {section.rows.map((row, rowIndex) =>
                      renderCard(
                        row,
                        rowIndex,
                        section.id,
                        section.rows.length,
                      ),
                    )}
                    {renderNewCard(section.groupValue, true)}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div
          className="database-gallery-grid"
          onDragOver={(event) => cardDrag.dragOver(event, null, rows.length)}
          onDrop={(event) => cardDrag.drop(event, null, rows.length)}
        >
          {rows.map((row, rowIndex) =>
            renderCard(row, rowIndex, null, rows.length),
          )}
          {renderNewCard()}
        </div>
      )}
      {hasNextPage || isFetchingNextPage ? (
        <div
          className="flex h-12 items-center justify-center gap-2 text-sm text-muted-foreground"
          ref={sentinelRef}
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
  )
}
