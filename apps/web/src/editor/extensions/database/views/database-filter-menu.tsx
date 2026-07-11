import { Filter, Plus, X } from "lucide-react"
import { Reorder } from "framer-motion"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  DatabaseConditionEditor,
  type DatabaseCondition,
  type DatabaseConditionUpdatePatch,
} from "./database-condition-editor"
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items"

export type DatabaseActiveFilter = DatabaseCondition
export type DatabaseFilterUpdatePatch = DatabaseConditionUpdatePatch

type DatabaseFilterMenuProps = {
  activeDatabaseFilters: DatabaseActiveFilter[]
  addableFilterFieldOptions: DatabaseSearchableMenuOption[]
  canAddDatabaseFilter: boolean
  filterFieldOptions: DatabaseSearchableMenuOption[]
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>
  onClearDatabaseFilter: () => void
  onCreateDatabaseFilter: (field: string) => void
  onRemoveDatabaseFilter: (index: number) => void
  onReorderDatabaseFilters: (filterIds: string[]) => void
  onUpdateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => void
}

function DatabaseFilterMenuContent({
  activeDatabaseFilters,
  addableFilterFieldOptions,
  canAddDatabaseFilter,
  filterFieldOptions,
  filterValueOptionsByField,
  onClearDatabaseFilter,
  onCreateDatabaseFilter,
  onRemoveDatabaseFilter,
  onReorderDatabaseFilters,
  onUpdateDatabaseFilter,
}: DatabaseFilterMenuProps) {
  const [addFilterPickerOpen, setAddFilterPickerOpen] = useState(false)
  const [draggingFilterId, setDraggingFilterId] = useState<string | null>(null)

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="mb-2 flex items-center gap-2 px-1 py-1">
        <Filter className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm font-semibold">Filter</div>
      </div>
      {activeDatabaseFilters.length > 0 ? (
        <Reorder.Group
          as="div"
          axis="y"
          className="space-y-2 px-1"
          layoutScroll
          values={activeDatabaseFilters.map((filter) => filter.id)}
          onReorder={onReorderDatabaseFilters}
        >
          {activeDatabaseFilters.map((filter, index) => {
            const availableFilterOptions = filterFieldOptions.filter(
              (option) =>
                option.value === filter.propertyId ||
                !activeDatabaseFilters.some(
                  (activeFilter, activeIndex) =>
                    activeIndex !== index &&
                    activeFilter.propertyId === option.value
                )
            )

            return (
              <DatabaseConditionEditor
                condition={filter}
                drag={{
                  ariaLabel: "Drag filter",
                  isDragging: draggingFilterId === filter.id,
                  onDragEnd: () => setDraggingFilterId(null),
                  onDragStart: () => setDraggingFilterId(filter.id),
                  value: filter.id,
                }}
                fieldOptions={availableFilterOptions}
                key={filter.id}
                layout="stacked"
                removeLabel={`Remove ${filter.label} filter`}
                valueOptions={filterValueOptionsByField[filter.propertyId] ?? []}
                onRemove={() => onRemoveDatabaseFilter(index)}
                onUpdate={(patch) => onUpdateDatabaseFilter(index, patch)}
              />
            )
          })}
        </Reorder.Group>
      ) : null}
      {activeDatabaseFilters.length === 0 && !addFilterPickerOpen ? (
        <div className="mb-2 px-1">
          <div className="rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            No filters yet
          </div>
        </div>
      ) : null}
      <div className="mt-2 space-y-1 px-1">
        {canAddDatabaseFilter ? (
          <DropDrawer
            open={addFilterPickerOpen}
            onOpenChange={setAddFilterPickerOpen}
          >
            <DropDrawerTrigger asChild>
              <Button
                className="h-8 w-full justify-start gap-2 text-xs"
                type="button"
                variant="secondary"
              >
                <Plus className="size-4" />
                <span>
                  {activeDatabaseFilters.length > 0 ? "Add another" : "New filter"}
                </span>
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent
              align="start"
              className="w-72"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DatabaseSearchableMenuItems
                emptyMessage="No properties available."
                inputAriaLabel="Add filter property"
                inputIcon={<Filter className="size-4" />}
                inputPlaceholder="Filter by..."
                onSelect={(field) => {
                  onCreateDatabaseFilter(field)
                  setAddFilterPickerOpen(false)
                }}
                open={addFilterPickerOpen}
                options={addableFilterFieldOptions}
              />
            </DropDrawerContent>
          </DropDrawer>
        ) : null}
        <Button
          className="h-8 w-full justify-start gap-2 text-xs"
          disabled={activeDatabaseFilters.length === 0}
          onClick={onClearDatabaseFilter}
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
          <span>Delete filters</span>
        </Button>
      </div>
    </div>
  )
}

export function DatabaseFilterPopover({
  activeDatabaseFilters,
  addableFilterFieldOptions,
  canAddDatabaseFilter,
  children,
  filterFieldOptions,
  filterValueOptionsByField,
  onClearDatabaseFilter,
  onCreateDatabaseFilter,
  onRemoveDatabaseFilter,
  onReorderDatabaseFilters,
  onUpdateDatabaseFilter,
}: DatabaseFilterMenuProps & {
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-1"
      >
        <DatabaseFilterMenuContent
          activeDatabaseFilters={activeDatabaseFilters}
          addableFilterFieldOptions={addableFilterFieldOptions}
          canAddDatabaseFilter={canAddDatabaseFilter}
          filterFieldOptions={filterFieldOptions}
          filterValueOptionsByField={filterValueOptionsByField}
          onClearDatabaseFilter={onClearDatabaseFilter}
          onCreateDatabaseFilter={onCreateDatabaseFilter}
          onRemoveDatabaseFilter={onRemoveDatabaseFilter}
          onReorderDatabaseFilters={onReorderDatabaseFilters}
          onUpdateDatabaseFilter={onUpdateDatabaseFilter}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DatabaseFilterSubmenu({
  activeDatabaseFilters,
  addableFilterFieldOptions,
  canAddDatabaseFilter,
  children,
  filterFieldOptions,
  filterValueOptionsByField,
  onClearDatabaseFilter,
  onCreateDatabaseFilter,
  onRemoveDatabaseFilter,
  onReorderDatabaseFilters,
  onUpdateDatabaseFilter,
}: DatabaseFilterMenuProps & {
  children: ReactNode
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>{children}</DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-80 max-w-[calc(100vw-2rem)]">
        <DatabaseFilterMenuContent
          activeDatabaseFilters={activeDatabaseFilters}
          addableFilterFieldOptions={addableFilterFieldOptions}
          canAddDatabaseFilter={canAddDatabaseFilter}
          filterFieldOptions={filterFieldOptions}
          filterValueOptionsByField={filterValueOptionsByField}
          onClearDatabaseFilter={onClearDatabaseFilter}
          onCreateDatabaseFilter={onCreateDatabaseFilter}
          onRemoveDatabaseFilter={onRemoveDatabaseFilter}
          onReorderDatabaseFilters={onReorderDatabaseFilters}
          onUpdateDatabaseFilter={onUpdateDatabaseFilter}
        />
      </DropDrawerSubContent>
    </DropDrawerSub>
  )
}
