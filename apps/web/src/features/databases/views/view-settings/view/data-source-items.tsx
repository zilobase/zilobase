import { Copy, Database, MoreHorizontal, Plus, X } from "@/shared/components/icons";
import { useState, type ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";

import type { DatabaseSourceMenuItem } from "../model/types";
import type { DatabaseViewType } from "../model/view-type-options";
import { ViewTypeOptionGrid } from "./view-type-option-grid";

export function DataSourceSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium text-content-secondary">
      {children}
    </div>
  );
}

export function DataSourceAddGlyph() {
  return (
    <span className="inline-flex size-4 items-center justify-center text-base leading-none text-content-secondary">
      +
    </span>
  );
}

export function DataSourceMenuItem({
  icon,
  item,
  onAddView,
}: {
  icon?: ReactNode;
  item: DatabaseSourceMenuItem;
  onAddView?: (dataSourceId: string, type: DatabaseViewType) => void;
}) {
  const [addViewOpen, setAddViewOpen] = useState(false);
  const viewLabel = `${item.viewCount} view${item.viewCount === 1 ? "" : "s"}`;

  return (
    <DropDrawerSub title={item.name}>
      <DropDrawerSubTrigger>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon ?? <Database className="text-content-secondary" />}
          <span className="truncate">{item.name}</span>
          <span className="ml-auto shrink-0 text-content-secondary">
            {viewLabel}
          </span>
          <MoreHorizontal className="text-content-secondary" />
        </div>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-56">
        {onAddView ? (
          <DropDrawerSub
            onOpenChange={setAddViewOpen}
            open={addViewOpen}
            title="Add view"
          >
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
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

export function LinkedDataSourceMenuItem({
  icon,
  item,
  onUnlink,
}: {
  icon?: ReactNode;
  item: DatabaseSourceMenuItem;
  onUnlink?: (dataSourceId: string) => void;
}) {
  const viewLabel = `${item.viewCount} view${item.viewCount === 1 ? "" : "s"}`;

  return (
    <DropDrawerItem
      disabled={!onUnlink}
      onSelect={() => onUnlink?.(item.id)}
    >
      {icon ?? <Database className="text-content-secondary" />}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="shrink-0 text-content-secondary">{viewLabel}</span>
      <X aria-label={`Remove ${item.name}`} className="text-content-secondary" />
    </DropDrawerItem>
  );
}
