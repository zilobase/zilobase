import {
  ArrowUpRightIcon,
  Copy,
  Database,
  FolderInput,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";

import type { DatabaseLinkedViewConfig } from "../database-view-config";
import type { DatabaseSourceMenuItem } from "./types";
import { getDatabaseViewTypePresentation } from "./view-type-options";
import type { DatabaseViewType } from "./view-type-options";
import { ViewTypeOptionGrid } from "./view-type-option-grid";

export function DataSourceSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

export function DataSourceAddGlyph() {
  return (
    <span className="inline-flex size-4 items-center justify-center text-base leading-none text-muted-foreground">
      +
    </span>
  );
}

export function DataSourceMenuItem({
  icon,
  item,
  onAddView,
  onMove,
}: {
  icon?: ReactNode;
  item: DatabaseSourceMenuItem;
  onAddView?: (sourceDatabaseId: string, type: DatabaseViewType) => void;
  onMove: (item: DatabaseSourceMenuItem) => void;
}) {
  const [addViewOpen, setAddViewOpen] = useState(false);
  const viewLabel = `${item.viewCount} view${item.viewCount === 1 ? "" : "s"}`;

  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon ?? <Database className="text-muted-foreground" />}
          <span className="truncate">{item.name}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {viewLabel}
          </span>
          <MoreHorizontal className="text-muted-foreground" />
        </div>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-56">
        {onAddView ? (
          <DropDrawerSub onOpenChange={setAddViewOpen} open={addViewOpen}>
            <DropDrawerSubTrigger>
              <Plus />
              <span>Add view</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72 max-w-[calc(100vw-1rem)] p-1">
              <ViewTypeOptionGrid
                onSelect={(type) => {
                  setAddViewOpen(false);
                  onAddView(item.id, type);
                }}
              />
            </DropDrawerSubContent>
          </DropDrawerSub>
        ) : null}
        <DropDrawerItem
          onSelect={() => {
            void navigator.clipboard?.writeText(item.id);
          }}
        >
          <Copy />
          <span>Copy data source ID</span>
        </DropDrawerItem>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            onMove(item);
          }}
        >
          <FolderInput />
          <span>Move to</span>
        </DropDrawerItem>
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

export function LinkedDataSourceMenuItem({
  view,
}: {
  view: DatabaseLinkedViewConfig;
}) {
  const { Icon: ViewIcon } = getDatabaseViewTypePresentation(view.viewType);

  return (
    <DropDrawerItem disabled>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ViewIcon className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate">{view.viewName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {view.databaseName}
          </div>
        </div>
        <ArrowUpRightIcon
          aria-label="Linked from another database"
          className="size-3 text-muted-foreground"
        />
      </div>
    </DropDrawerItem>
  );
}
