import { Filter } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { DropDrawer, DropDrawerContent, DropDrawerTrigger } from "@/shared/ui/dropdrawer";
import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";

export function DatabaseFilterControl() {
  const { createDatabaseFilter, setFilterPickerOpen, toggleFilterPillVisibility } =
    useDatabaseActionsContext();
  const { activeDatabaseFilters, filterFieldOptions } = useDatabaseDataContext();
  const { filterPickerOpen, showFilterPill } = useDatabaseUiContext();
  return activeDatabaseFilters.length === 0 ? (
    <DropDrawer open={filterPickerOpen} onOpenChange={setFilterPickerOpen}>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Add filter"
          className="text-content-secondary"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Filter />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DatabaseSearchableMenuItems
          inputAriaLabel="Filter properties"
          inputIcon={<Filter className="size-4" />}
          inputPlaceholder="Filter by..."
          onSelect={createDatabaseFilter}
          open={filterPickerOpen}
          options={filterFieldOptions}
        />
      </DropDrawerContent>
    </DropDrawer>
  ) : (
    <Button
      aria-label={showFilterPill ? "Hide filter pill" : "Show filter pill"}
      className={showFilterPill ? "text-content-primary" : "text-content-secondary"}
      onClick={toggleFilterPillVisibility}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Filter />
    </Button>
  );
}
