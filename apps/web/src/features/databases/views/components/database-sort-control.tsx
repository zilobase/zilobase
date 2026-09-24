import { ArrowDownUp } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { DropDrawer, DropDrawerContent, DropDrawerTrigger } from "@/shared/ui/dropdrawer";
import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";

export function DatabaseSortControl() {
  const { createDatabaseSort, setSortPickerOpen, toggleSortPillVisibility } =
    useDatabaseActionsContext();
  const { activeDatabaseSorts, sortFieldOptions } = useDatabaseDataContext();
  const { showSortPill, sortPickerOpen } = useDatabaseUiContext();
  return activeDatabaseSorts.length === 0 ? (
    <DropDrawer open={sortPickerOpen} onOpenChange={setSortPickerOpen}>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Add sort"
          className="text-content-secondary"
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
        <DatabaseSearchableMenuItems
          inputAriaLabel="Sort properties"
          inputIcon={<ArrowDownUp className="size-4" />}
          inputPlaceholder="Sort by..."
          onSelect={createDatabaseSort}
          open={sortPickerOpen}
          options={sortFieldOptions}
        />
      </DropDrawerContent>
    </DropDrawer>
  ) : (
    <Button
      aria-label={showSortPill ? "Hide sort pill" : "Show sort pill"}
      className={showSortPill ? "text-content-primary" : "text-content-secondary"}
      onClick={toggleSortPillVisibility}
      size="icon"
      type="button"
      variant="ghost"
    >
      <ArrowDownUp />
    </Button>
  );
}
