import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronsUpDown,
  ChevronDown,
  Copy,
  EyeOff,
  Filter,
  Pin,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"

import { getDatabasePropertyType } from "./constants"

export function DatabasePropertyMenu({
  name,
  type,
  onRename,
}: {
  name: string
  type: string
  onRename: (name: string) => void
}) {
  const propertyType = getDatabasePropertyType(type)
  const PropertyIcon = propertyType.icon

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <button
          aria-label={`${name} property options`}
          className="group flex h-8 w-full min-w-0 items-stretch gap-2 px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none data-[state=open]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          type="button"
        >
          <PropertyIcon className="self-center text-muted-foreground" />
          <span className="flex min-w-0 items-center truncate">{name}</span>
          <ChevronDown className="ml-auto self-center opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <PropertyIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Property name"
            className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            defaultValue={name}
            onBlur={(event) => {
              const nextName = event.target.value.trim()

              if (nextName && nextName !== name) {
                onRename(nextName)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <DropDrawerSeparator />
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Settings2 />
            <span>Edit property</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Property settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ChevronsUpDown />
            <span>Change type</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>
              <PropertyIcon />
              <span>{propertyType.label}</span>
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Sparkles />
            <span>AI Autofill</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Configure autofill</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <Filter />
          <span>Filter</span>
        </DropDrawerItem>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ArrowDownUp />
            <span>Sort</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Ascending</DropDrawerItem>
            <DropDrawerItem disabled>Descending</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem disabled>
          <Pin />
          <span>Freeze</span>
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <EyeOff />
          <span>Hide</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <ArrowLeftToLine />
          <span>Insert left</span>
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <ArrowRightToLine />
          <span>Insert right</span>
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <Copy />
          <span>Duplicate property</span>
        </DropDrawerItem>
        <DropDrawerItem disabled variant="destructive">
          <Trash2 />
          <span>Delete property</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}
