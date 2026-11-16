import * as React from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Search } from "@/components/icons";

import { IconColorGrid } from "@/components/ui/icon-color-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildLucideStoredSvgByName } from "@/components/ui/icon-svg";
import { lucideIcons } from "@/components/ui/lucide-icon-catalog";

type LucideCatalogEntry = {
  label: string;
  name: IconName;
  searchText: string;
};

const lucideCatalog: LucideCatalogEntry[] = lucideIcons
  .split("|")
  .map((entry) => {
    const [name, ...aliases] = entry.split(" ");
    const label = formatLucideLabel(name);

    return {
      label,
      name: name as IconName,
      searchText: [name, ...aliases, label.toLowerCase()].join(" "),
    };
  })
  .sort((first, second) => first.label.localeCompare(second.label));

type LucideIconPickerProps = {
  className?: string;
  onIconSelect: (svg: string) => void;
};

const ICON_BATCH_SIZE = 72;

export function LucideIconPicker({ className, onIconSelect }: LucideIconPickerProps) {
  const [query, setQuery] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(ICON_BATCH_SIZE);

  const filteredIcons = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return lucideCatalog;
    }

    return lucideCatalog.filter((icon) => icon.searchText.includes(normalizedQuery));
  }, [query]);

  React.useEffect(() => {
    setVisibleCount(ICON_BATCH_SIZE);
  }, [query]);

  const visibleIcons = filteredIcons.slice(0, visibleCount);

  return (
    <div
      className={cn(
        "isolate flex h-[342px] w-72 flex-col bg-surface-overlay text-content-primary",
        className,
      )}
    >
      <div className="relative mx-2 mt-2">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-content-secondary" />
        <input
          autoFocus
          className="h-7 w-full rounded-md border border-control-border bg-control-background pr-2 pl-8 text-sm outline-none placeholder:text-content-secondary focus-visible:border-action-focus-ring focus-visible:ring-1 focus-visible:ring-action-focus-ring dark:bg-control-background"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search icons..."
          type="search"
          value={query}
        />
      </div>
      <div
        className="relative flex-1 overflow-y-auto pb-2 outline-none"
        onScroll={(event) => {
          const element = event.currentTarget;

          if (
            element.scrollHeight - element.scrollTop - element.clientHeight < 96 &&
            visibleCount < filteredIcons.length
          ) {
            setVisibleCount((count) => Math.min(count + ICON_BATCH_SIZE, filteredIcons.length));
          }
        }}
      >
        {filteredIcons.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-content-secondary">
            No icons found.
          </div>
        ) : (
          <div className="grid grid-cols-9 px-2 pt-2">
            {visibleIcons.map((icon) => (
              <LucideIconOption icon={icon} key={icon.name} onIconSelect={onIconSelect} />
            ))}
          </div>
        )}
      </div>
      <div className="flex h-10 items-center border-t px-3 text-xs text-content-secondary">
        Select an icon
      </div>
    </div>
  );
}

function LucideIconOption({
  icon,
  onIconSelect,
}: {
  icon: LucideCatalogEntry;
  onIconSelect: (svg: string) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={icon.label}
          className="flex aspect-square size-8 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none active:bg-action-neutral-pressed data-[state=open]:bg-action-neutral-hover"
          title={icon.label}
          type="button"
        >
          <DynamicIcon aria-hidden className="size-5" name={icon.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-0 p-2" side="right" sideOffset={6}>
        <IconColorGrid
          label={icon.label}
          onSelect={async (colorValue) => {
            const storedSvg = await buildLucideStoredSvgByName(icon.name, colorValue);

            if (storedSvg) {
              onIconSelect(storedSvg);
            }
          }}
          preview={<DynamicIcon aria-hidden name={icon.name} />}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatLucideLabel(name: string) {
  const label = name.replaceAll("-", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
