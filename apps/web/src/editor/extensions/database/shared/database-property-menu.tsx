import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  EyeOff,
  Filter,
  GripVertical,
  Pin,
  Plus,
  Settings2,
  Sigma,
  Sparkles,
  TextWrap,
  Trash2,
} from "lucide-react"
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useDeleteDatabaseProperty,
  useDuplicateDatabaseProperty,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
} from "@notelab/features/databases"

import { getDatabasePropertyType } from "../constants"
import {
  getDatabaseSorts,
  getMergedDatabaseConfig,
  getMergedPropertyConfig,
  getPropertyWrapContent,
  upsertDatabaseSort,
  type DatabasePropertyConfig,
  type DatabaseSortDirection,
} from "./database-view-config"
import { DatabasePropertyEditSubmenu } from "./database-property-edit-submenu"

export { DatabaseNamePropertyMenu } from "./database-name-property-menu"
export { DatabasePropertyEditSubmenu } from "./database-property-edit-submenu"

export function DatabasePropertyMenu({
  config,
  databaseConfig,
  databaseId,
  databasePropertyId,
  name,
  onOpenChange,
  onInsertProperty,
  onEditFormula,
  onRename,
  open,
  onToggleGroup,
  isGrouped = false,
  type,
}: {
  config?: unknown
  databaseConfig?: unknown
  databaseId: string
  databasePropertyId: string
  isGrouped?: boolean
  name: string
  onOpenChange?: (open: boolean) => void
  onInsertProperty: (side: "left" | "right") => void
  onEditFormula?: () => void
  onRename: (name: string) => void
  onToggleGroup?: () => void
  open?: boolean
  type: string
}) {
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const updateDatabase = useUpdateDatabase()
  const updateProperty = useUpdateDatabaseProperty()
  const deleteProperty = useDeleteDatabaseProperty()
  const duplicateProperty = useDuplicateDatabaseProperty()
  const propertyType = getDatabasePropertyType(type)
  const PropertyIcon = propertyType.icon
  const currentSorts = getDatabaseSorts(databaseConfig)
  const currentSortDirection = currentSorts.find(
    (sort) => sort.column === databasePropertyId
  )?.direction
  const isButtonProperty = type === "button"
  const isFormulaProperty = type === "formula"
  const wrapContent = getPropertyWrapContent(config)
  const updatePropertyConfig = (nextConfig: DatabasePropertyConfig) => {
    updateProperty.mutate({
      config: getMergedPropertyConfig(config, nextConfig),
      databaseId,
      databasePropertyId,
    })
  }
  const updateSort = (direction: DatabaseSortDirection) => {
    updateDatabase.mutate({
      config: getMergedDatabaseConfig(databaseConfig, {
        sort: undefined,
        sorts: upsertDatabaseSort(currentSorts, {
          column: databasePropertyId,
          direction,
        }),
      }),
      databaseId,
    })
  }
  const duplicateDatabaseProperty = (includeValues: boolean) => {
    duplicateProperty.mutate({
      databaseId,
      databasePropertyId,
      includeValues,
    })
  }

  return (
    <>
      <DropDrawer open={open} onOpenChange={onOpenChange}>
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

                if (nextName !== name) {
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
          {isButtonProperty ? (
            <DropDrawerItem onSelect={() => setAutomationDialogOpen(true)}>
              <Sparkles />
              <span>Edit automation</span>
            </DropDrawerItem>
          ) : isFormulaProperty ? (
            <DropDrawerItem
              disabled={!onEditFormula}
              onSelect={() => onEditFormula?.()}
            >
              <Sigma />
              <span>Edit formula</span>
            </DropDrawerItem>
          ) : (
            <DatabasePropertyEditSubmenu
              config={config}
              databaseId={databaseId}
              databasePropertyId={databasePropertyId}
              type={type}
            >
              <Settings2 />
              <span>Edit property</span>
            </DatabasePropertyEditSubmenu>
          )}
          <DropDrawerItem
            aria-pressed={wrapContent}
            onSelect={(event) => {
              event.preventDefault()
              updatePropertyConfig({ wrapContent: !wrapContent })
            }}
          >
            <TextWrap />
            <span>{wrapContent ? "Unwrap content" : "Wrap content"}</span>
          </DropDrawerItem>
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
          {isFormulaProperty ? null : (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <Sparkles />
                <span>AI Autofill</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent>
                <DropDrawerItem disabled>Configure autofill</DropDrawerItem>
              </DropDrawerSubContent>
            </DropDrawerSub>
          )}
          <DropDrawerSeparator />
          <DropDrawerItem disabled>
            <Filter />
            <span>Filter</span>
          </DropDrawerItem>
          <DropDrawerItem
            onSelect={(event) => {
              event.preventDefault()
              onToggleGroup?.()
            }}
          >
            <GripVertical />
            <span>{isGrouped ? "Ungroup" : "Group"}</span>
          </DropDrawerItem>
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <ArrowDownUp />
              <span>Sort</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent>
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault()
                  updateSort("ascending")
                }}
              >
                <span>Ascending</span>
                {currentSortDirection === "ascending" ? (
                  <Check className="ml-auto" />
                ) : null}
              </DropDrawerItem>
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault()
                  updateSort("descending")
                }}
              >
                <span>Descending</span>
                {currentSortDirection === "descending" ? (
                  <Check className="ml-auto" />
                ) : null}
              </DropDrawerItem>
            </DropDrawerSubContent>
          </DropDrawerSub>
          <DropDrawerItem disabled>
            <Pin />
            <span>Freeze</span>
          </DropDrawerItem>
          <DropDrawerItem
            onSelect={() => updatePropertyConfig({ hidden: true })}
          >
            <EyeOff />
            <span>Hide</span>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem onSelect={() => onInsertProperty("left")}>
            <ArrowLeftToLine />
            <span>Insert left</span>
          </DropDrawerItem>
          <DropDrawerItem onSelect={() => onInsertProperty("right")}>
            <ArrowRightToLine />
            <span>Insert right</span>
          </DropDrawerItem>
          <DropDrawerItem
            disabled={duplicateProperty.isPending}
            onSelect={() => setDuplicateDialogOpen(true)}
          >
            <Copy />
            <span>Duplicate property</span>
          </DropDrawerItem>
          <DropDrawerItem
            disabled={deleteProperty.isPending}
            onSelect={() =>
              deleteProperty.mutate({
                databaseId,
                databasePropertyId,
              })
            }
            variant="destructive"
          >
            <Trash2 />
            <span>Delete property</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
      <AlertDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate property?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose whether to copy only the property setup or also duplicate
              its existing values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => duplicateDatabaseProperty(false)}>
              Property only
            </AlertDialogAction>
            <AlertDialogAction onClick={() => duplicateDatabaseProperty(true)}>
              Property + values
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={automationDialogOpen}
        onOpenChange={setAutomationDialogOpen}
      >
        <DialogContent className="sm:max-w-xl">
          <ButtonAutomationDialog propertyName={name} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function ButtonAutomationDialog({
  propertyName,
}: {
  propertyName: string
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{propertyName}</DialogTitle>
        <DialogDescription>
          Configure what happens when this button is clicked.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-6">
        <section className="grid gap-2">
          <div className="text-sm font-medium text-muted-foreground">When</div>
          <Button
            className="w-full"
            type="button"
            variant="outline"
          >
            <Sparkles className="size-5 shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground">
              Button is clicked
            </span>
          </Button>
        </section>
        <div className="flex justify-center">
          <div className="h-10 w-px bg-border" />
        </div>
        <section className="grid gap-2">
          <div className="text-sm font-medium text-muted-foreground">Do</div>
          <Button
            className="w-full"
            type="button"
            variant="outline"
          >
            <Plus className="size-5 shrink-0" />
            <span>New action</span>
          </Button>
        </section>
      </div>
      <DialogFooter>
        <Button type="button">
          Save
        </Button>
      </DialogFooter>
    </>
  )
}
