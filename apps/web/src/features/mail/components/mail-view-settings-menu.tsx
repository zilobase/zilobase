import {
  DatabaseIcon,
  FilterIcon,
  IntersectSquareIcon,
  ListIcon,
  SlidersHorizontalIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import type { ReactNode } from "react"

const panels = [
  { icon: IntersectSquareIcon, label: "Group", right: undefined, title: "Group" },
  { icon: FilterIcon, label: "Filter", right: undefined, title: "Filter" },
  { icon: ListIcon, label: "Properties", right: "4 properties", title: "Properties" },
  { icon: DatabaseIcon, label: "Database", right: undefined, title: "Database" },
] as const

export function MailViewSettingsMenu({
  filterCount = 0,
  filterDirty = false,
  filterEditor,
}: {
  filterCount?: number
  filterDirty?: boolean
  filterEditor?: ReactNode
}) {
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
        <div className="px-2 py-1.5 text-sm font-semibold text-content-primary">
          Edit view
        </div>
        {panels.map(({ icon: Icon, label, right, title }) => (
          <DropDrawerSub displayMode="inline" key={label} title={title}>
            <DropDrawerSubTrigger>
              <Icon />
              <span>{label}</span>
              {label === "Filter" && filterDirty ? (
                <span aria-label="Unsaved filters" className="ml-auto size-1.5 rounded-full bg-feedback-warning" />
              ) : null}
              {label === "Filter" && filterCount > 0 ? (
                <span className={filterDirty ? "text-content-secondary" : "ml-auto text-content-secondary"}>{filterCount}</span>
              ) : null}
              {right ? (
                <span className="ml-auto text-content-secondary">{right}</span>
              ) : null}
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72">
              {label === "Filter" && filterEditor ? filterEditor : (
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
            <DropDrawerItem disabled>
              Hover actions are enabled in their organization pass.
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
      </DropDrawerContent>
    </DropDrawer>
  )
}
