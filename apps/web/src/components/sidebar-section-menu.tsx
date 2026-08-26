import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  EyeOffIcon,
  HashIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarGroupAction } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type {
  SidebarConfig,
  SidebarSectionId,
  SidebarSectionLimit,
  SidebarSectionSort,
} from "@zilobase/features/user-settings"

const sectionActionClassName =
  "rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"

export function SidebarSectionMenu({
  className,
  config,
  label,
  onChange,
  onCustomize,
  sectionId,
}: {
  className?: string
  config: SidebarConfig
  label?: string
  onChange: (config: SidebarConfig) => void
  onCustomize: () => void
  sectionId: SidebarSectionId
}) {
  const position = config.sectionOrder.indexOf(sectionId)
  const updateSort = (sort: SidebarSectionSort) => {
    onChange({
      ...config,
      sectionSorts: { ...config.sectionSorts, [sectionId]: sort },
    })
  }
  const updateLimit = (limit: SidebarSectionLimit) => {
    onChange({
      ...config,
      sectionLimits: { ...config.sectionLimits, [sectionId]: limit },
    })
  }
  const move = (offset: -1 | 1) => {
    const nextPosition = position + offset
    if (position < 0 || nextPosition < 0 || nextPosition >= config.sectionOrder.length) {
      return
    }

    const sectionOrder = [...config.sectionOrder]
    ;[sectionOrder[position], sectionOrder[nextPosition]] = [
      sectionOrder[nextPosition],
      sectionOrder[position],
    ]
    onChange({ ...config, sectionOrder })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarGroupAction
          aria-label={`Configure ${label ?? sectionId} section`}
          className={cn(
            sectionActionClassName,
            className,
          )}
          title="Section options"
        >
          <MoreHorizontalIcon />
        </SidebarGroupAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" side="right">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDownIcon />
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span>Sort</span>
              <span className="ml-auto text-right text-xs text-muted-foreground">
                {config.sectionSorts[sectionId] === "alphabetical"
                  ? "A–Z"
                  : sectionId === "recents"
                    ? "Last visited"
                    : "Last edited"}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              onValueChange={(value) => updateSort(value as SidebarSectionSort)}
              value={config.sectionSorts[sectionId]}
            >
              <DropdownMenuRadioItem value="lastEdited">
                {sectionId === "recents" ? "Last visited" : "Last edited"}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="alphabetical">
                Alphabetical
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HashIcon />
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span>Show</span>
              <span className="ml-auto text-right text-xs text-muted-foreground">
                {config.sectionLimits[sectionId]}
              </span>
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                updateLimit(Number(value) as SidebarSectionLimit)
              }
              value={String(config.sectionLimits[sectionId])}
            >
              {[5, 10, 20, 50].map((limit) => (
                <DropdownMenuRadioItem key={limit} value={String(limit)}>
                  {limit}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={position <= 0} onSelect={() => move(-1)}>
          <ArrowUpIcon />
          <span>Move up</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={position === config.sectionOrder.length - 1}
          onSelect={() => move(1)}
        >
          <ArrowDownIcon />
          <span>Move down</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            onChange({
              ...config,
              hiddenItems: [...new Set([...config.hiddenItems, sectionId])],
            })
          }
        >
          <EyeOffIcon />
          <span>Hide section</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCustomize}>
          <SlidersHorizontalIcon />
          <span>Customize sidebar</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
