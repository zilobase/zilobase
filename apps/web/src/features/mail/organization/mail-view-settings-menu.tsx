import {
  DatabaseIcon,
  FilterIcon,
  IntersectSquareIcon,
  ListIcon,
  SlidersHorizontalIcon,
} from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import type { ReactNode } from "react";

const panels = [
  { icon: IntersectSquareIcon, label: "Group", title: "Group" },
  { icon: FilterIcon, label: "Filter", title: "Filter" },
  { icon: ListIcon, label: "Properties", title: "Properties" },
  { icon: DatabaseIcon, label: "Database", title: "Database" },
] as const;

export function MailViewSettingsMenu({
  filterCount = 0,
  filterDirty = false,
  filterEditor,
  databaseEditor,
  groupEditor,
  hoverActionsEditor,
  propertiesEditor,
  visiblePropertyCount = 0,
}: {
  databaseEditor?: ReactNode;
  filterCount?: number;
  filterDirty?: boolean;
  filterEditor?: ReactNode;
  groupEditor?: ReactNode;
  hoverActionsEditor?: ReactNode;
  propertiesEditor?: ReactNode;
  visiblePropertyCount?: number;
}) {
  const panelEditors = {
    Group: groupEditor,
    Filter: filterEditor,
    Properties: propertiesEditor,
    Database: databaseEditor,
  };
  return (
    <DropDrawer defaultSubDisplayMode="inline">
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Open mail view settings"
          size="icon-lg"
          title="View settings"
          type="button"
          variant="ghost"
        >
          <SlidersHorizontalIcon />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="end"
        className="w-72 max-h-none overflow-visible"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="px-2 py-1.5 text-sm font-semibold text-content-primary">Edit view</div>
        {panels.map(({ icon: Icon, label, title }) => (
          <DropDrawerSub displayMode="inline" key={label} title={title}>
            <DropDrawerSubTrigger>
              <Icon />
              <span>{label}</span>
              {label === "Filter" && filterDirty ? (
                <span
                  aria-label="Unsaved filters"
                  className="ml-auto size-1.5 rounded-full bg-feedback-warning"
                />
              ) : null}
              {label === "Filter" && filterCount > 0 ? (
                <span
                  className={
                    filterDirty ? "text-content-secondary" : "ml-auto text-content-secondary"
                  }
                >
                  {filterCount}
                </span>
              ) : null}
              {label === "Properties" ? (
                <span className="ml-auto text-content-secondary">
                  {visiblePropertyCount} properties
                </span>
              ) : null}
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className={label === "Filter" ? "w-80" : "w-72"}>
              {panelEditors[label] || (
                <DropDrawerItem disabled>
                  This panel is enabled in its organization pass.
                </DropDrawerItem>
              )}
            </DropDrawerSubContent>
          </DropDrawerSub>
        ))}
        <DropDrawerSeparator />
        <DropDrawerSub displayMode="inline" title="Customize hover actions">
          <DropDrawerSubTrigger>
            <SlidersHorizontalIcon />
            <span>Customize hover actions</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            {hoverActionsEditor ?? (
              <DropDrawerItem disabled>Hover actions are unavailable for this view.</DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
      </DropDrawerContent>
    </DropDrawer>
  );
}
