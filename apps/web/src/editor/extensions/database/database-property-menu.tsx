import {
  ArrowDownUp,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  Bell,
  Calendar,
  Check,
  ChevronsUpDown,
  ChevronDown,
  CircleUserRound,
  Copy,
  EyeOff,
  FileText,
  Flag,
  Filter,
  GripVertical,
  Hash,
  Pin,
  Plus,
  Settings2,
  Sparkles,
  TextWrap,
  Trash2,
  UserRound,
} from "lucide-react"
import { useState, type ReactNode } from "react"

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
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  useDeleteDatabaseProperty,
  useDuplicateDatabaseProperty,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
} from "@notelab/features/databases"
import {
  colorTokens,
  cyclingColorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
  getColorTokenValue,
} from "@/packages/editor/components/editor/toolbar-data"

import { defaultStatusOptions, getDatabasePropertyType } from "./constants"
import {
  dateFormatOptions,
  getDateFormatConfig,
  getTimeFormatConfig,
  type DateFormatValue,
  timeFormatOptions,
  type TimeFormatValue,
} from "./database-date-cell"

type StatusOption = {
  color?: string
  group?: string
  id: string
  name: string
}

type SelectOption = {
  color?: string
  id: string
  name: string
}

type DatabasePropertyConfig = {
  dateFormat?: DateFormatValue
  defaultOptionId?: string
  filesLimit?: FilesLimitValue
  personDefault?: PersonDefaultValue
  personLimit?: PersonLimitValue
  personNotifications?: PersonNotificationsValue
  selectOptionSort?: SelectOptionSortValue
  showFullUrl?: boolean
  timeFormat?: TimeFormatValue
  wrapContent?: boolean
  options?: SelectOption[]
}

type DatabaseConfig = {
  emoji?: string
  nameColumn?: DatabaseNameColumnConfig
  sort?: DatabaseSortConfig
  sorts?: DatabaseSortConfig[]
}

type DatabaseNameColumnConfig = {
  label?: string
  showPageIcon?: boolean
  wrapContent?: boolean
}

export type DatabaseSortDirection = "ascending" | "descending"

export type DatabaseSortConfig = {
  column: string
  direction: DatabaseSortDirection
}

type FilesLimitValue = "one_file" | "no_limit"
type PersonLimitValue = "one_person" | "no_limit"
type PersonDefaultValue = "no_default" | "created_by"
type PersonNotificationsValue = "users_and_groups" | "users_only" | "none"
type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"

function NameColumnGlyph() {
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center text-[11px] font-semibold leading-none">
      Aa
    </span>
  )
}

export function DatabaseNamePropertyMenu({
  config,
  databaseId,
  onInsertProperty,
}: {
  config?: unknown
  databaseId: string
  onInsertProperty: (side: "left" | "right") => void
}) {
  const updateDatabase = useUpdateDatabase()
  const label = getNameColumnLabel(config)
  const currentSorts = getDatabaseSorts(config)
  const currentSortDirection = currentSorts.find(
    (sort) => sort.column === "name"
  )?.direction
  const showPageIcon = getNameColumnShowPageIcon(config)
  const wrapContent = getNameColumnWrapContent(config)
  const updateNameColumnConfig = (nextConfig: DatabaseNameColumnConfig) => {
    updateDatabase.mutate({
      config: getMergedNameColumnConfig(config, nextConfig),
      databaseId,
    })
  }
  const updateSort = (direction: DatabaseSortDirection) => {
    updateDatabase.mutate({
      config: getMergedDatabaseConfig(config, {
        sort: undefined,
        sorts: upsertDatabaseSort(currentSorts, {
          column: "name",
          direction,
        }),
      }),
      databaseId,
    })
  }

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <button
          aria-label="Name column options"
          className="group flex h-8 w-full min-w-0 items-stretch gap-2 px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none data-[state=open]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          type="button"
        >
          <span className="self-center text-muted-foreground">
            <NameColumnGlyph />
          </span>
          <span className="flex min-w-0 items-center truncate">{label}</span>
          <ChevronDown className="ml-auto self-center opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="shrink-0 text-muted-foreground">
            <NameColumnGlyph />
          </span>
          <Input
            aria-label="Name column label"
            className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            defaultValue={label}
            onBlur={(event) => {
              const nextLabel = event.target.value.trim() || "Name"

              if (nextLabel !== label) {
                updateNameColumnConfig({
                  label: nextLabel === "Name" ? undefined : nextLabel,
                })
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
        <DropDrawerItem
          aria-pressed={showPageIcon}
          onSelect={(event) => {
            event.preventDefault()
            updateNameColumnConfig({ showPageIcon: !showPageIcon })
          }}
        >
          <FileText />
          <span>Show page icon</span>
          <Switch
            checked={showPageIcon}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <Sparkles />
          <span>AI Autofill</span>
          <DropDrawerShortcut>Soon</DropDrawerShortcut>
        </DropDrawerItem>
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
          aria-pressed={wrapContent}
          onSelect={(event) => {
            event.preventDefault()
            updateNameColumnConfig({ wrapContent: !wrapContent })
          }}
        >
          <TextWrap />
          <span>{wrapContent ? "Unwrap content" : "Wrap content"}</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem onSelect={() => onInsertProperty("right")}>
          <ArrowRightToLine />
          <span>Insert right</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}

export function DatabasePropertyMenu({
  config,
  databaseConfig,
  databaseId,
  databasePropertyId,
  name,
  onInsertProperty,
  onRename,
  type,
}: {
  config?: unknown
  databaseConfig?: unknown
  databaseId: string
  databasePropertyId: string
  name: string
  onInsertProperty: (side: "left" | "right") => void
  onRename: (name: string) => void
  type: string
}) {
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const updateDatabase = useUpdateDatabase()
  const updateProperty = useUpdateDatabaseProperty()
  const deleteProperty = useDeleteDatabaseProperty()
  const duplicateProperty = useDuplicateDatabaseProperty()
  const propertyType = getDatabasePropertyType(type)
  const PropertyIcon = propertyType.icon
  const isStatusProperty = type === "status"
  const isSelectProperty = type === "select" || type === "multi_select"
  const isPersonProperty = type === "person"
  const isFilesProperty = type === "files"
  const isUrlProperty = type === "url"
  const isDateProperty = type === "date"
  const currentSorts = getDatabaseSorts(databaseConfig)
  const currentSortDirection = currentSorts.find(
    (sort) => sort.column === databasePropertyId
  )?.direction
  const showFullUrl = getShowFullUrl(config)
  const wrapContent = getWrapContent(config)
  const statusDefaultOptionId = getStatusDefaultOptionId(config)
  const statusOptions = getStatusOptions(config)
  const selectOptions = getSelectOptions(config)
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
          {isUrlProperty ? (
            <DropDrawerItem
              aria-pressed={showFullUrl}
              onSelect={(event) => {
                event.preventDefault()
                updatePropertyConfig({ showFullUrl: !showFullUrl })
              }}
            >
              <ArrowLeftRight />
              <span>Show full URL</span>
              <Switch
                checked={showFullUrl}
                className="ml-auto pointer-events-none"
                size="sm"
                tabIndex={-1}
              />
            </DropDrawerItem>
          ) : (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <Settings2 />
                <span>Edit property</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent
                className={
                  isStatusProperty ||
                  isSelectProperty ||
                  isPersonProperty ||
                  isFilesProperty ||
                  isDateProperty
                    ? "w-72"
                    : undefined
                }
              >
                {isStatusProperty ? (
                  <StatusPropertyOptions
                    defaultOptionId={statusDefaultOptionId}
                    onUpdateConfig={updatePropertyConfig}
                    options={statusOptions}
                  />
                ) : isSelectProperty ? (
                  <SelectPropertyOptions
                    onUpdateConfig={updatePropertyConfig}
                    options={selectOptions}
                    sort={getSelectOptionSort(config)}
                  />
                ) : isPersonProperty ? (
                  <PersonPropertyOptions
                    config={getPersonConfig(config)}
                    onUpdateConfig={updatePropertyConfig}
                  />
                ) : isFilesProperty ? (
                  <FilesPropertyOptions
                    config={getFilesConfig(config)}
                    onUpdateConfig={updatePropertyConfig}
                  />
                ) : isDateProperty ? (
                  <DatePropertyOptions
                    dateFormat={getDateFormatConfig(config)}
                    timeFormat={getTimeFormatConfig(config)}
                    onUpdateConfig={updatePropertyConfig}
                  />
                ) : (
                  <DropDrawerItem disabled>Property settings</DropDrawerItem>
                )}
              </DropDrawerSubContent>
            </DropDrawerSub>
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
          <DropDrawerItem disabled>
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
    </>
  )
}

function DatePropertyOptions({
  dateFormat,
  onUpdateConfig,
  timeFormat,
}: {
  dateFormat: DateFormatValue
  onUpdateConfig: (config: DatabasePropertyConfig) => void
  timeFormat: TimeFormatValue
}) {
  return (
    <>
      <PropertySettingSubmenu
        icon={<Calendar />}
        label="Date format"
        options={dateFormatOptions}
        selectedValue={dateFormat}
        onSelect={(dateFormat) => onUpdateConfig({ dateFormat })}
      />
      <PropertySettingSubmenu
        icon={<Calendar />}
        label="Time format"
        options={timeFormatOptions}
        selectedValue={timeFormat}
        onSelect={(timeFormat) => onUpdateConfig({ timeFormat })}
      />
    </>
  )
}

function FilesPropertyOptions({
  config,
  onUpdateConfig,
}: {
  config: Required<Pick<DatabasePropertyConfig, "filesLimit">>
  onUpdateConfig: (config: DatabasePropertyConfig) => void
}) {
  return (
    <PropertySettingSubmenu
      icon={<Hash />}
      label="Limit"
      options={filesLimitOptions}
      selectedValue={config.filesLimit}
      onSelect={(filesLimit) => onUpdateConfig({ filesLimit })}
    />
  )
}

function PersonPropertyOptions({
  config,
  onUpdateConfig,
}: {
  config: Required<
    Pick<
      DatabasePropertyConfig,
      "personDefault" | "personLimit" | "personNotifications"
    >
  >
  onUpdateConfig: (config: DatabasePropertyConfig) => void
}) {
  return (
    <>
      <PropertySettingSubmenu
        icon={<Hash />}
        label="Limit"
        options={personLimitOptions}
        selectedValue={config.personLimit}
        onSelect={(personLimit) => onUpdateConfig({ personLimit })}
      />
      <PropertySettingSubmenu
        icon={<CircleUserRound />}
        label="Default"
        options={personDefaultOptions}
        selectedValue={config.personDefault}
        onSelect={(personDefault) => onUpdateConfig({ personDefault })}
      />
      <PropertySettingSubmenu
        icon={<Bell />}
        label="Notifications"
        options={personNotificationsOptions}
        selectedValue={config.personNotifications}
        onSelect={(personNotifications) =>
          onUpdateConfig({ personNotifications })
        }
      />
    </>
  )
}

function PropertySettingSubmenu<TValue extends string>({
  icon,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  icon: ReactNode
  label: string
  onSelect: (value: TValue) => void
  options: {
    icon?: ReactNode
    label: string
    value: TValue
  }[]
  selectedValue: TValue
}) {
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? options[0]

  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        {icon}
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground">{selectedOption?.label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {options.map((option) => (
          <DropDrawerItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault()
              onSelect(option.value)
            }}
          >
            {option.icon ?? null}
            <span>{option.label}</span>
            {option.value === selectedValue ? <Check className="ml-auto" /> : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  )
}

function SelectPropertyOptions({
  onUpdateConfig,
  options,
  sort,
}: {
  onUpdateConfig: (config: DatabasePropertyConfig) => void
  options: SelectOption[]
  sort: SelectOptionSortValue
}) {
  const updateOption = (optionId: string, patch: Partial<SelectOption>) => {
    const nextOptions = options.map((option) =>
      option.id === optionId ? { ...option, ...patch } : option
    )

    onUpdateConfig({
      options: getSortedSelectOptions(nextOptions, sort),
    })
  }
  const addOption = () => {
    const optionName = getUniqueOptionName(options, "Option")
    const nextOptions = [
      ...options,
      {
        color: getNextOptionColor(options),
        id: crypto.randomUUID(),
        name: optionName,
      },
    ]

    onUpdateConfig({
      options: getSortedSelectOptions(nextOptions, sort),
    })
  }
  const updateSort = (selectOptionSort: SelectOptionSortValue) => {
    onUpdateConfig({
      options:
        selectOptionSort === "manual"
          ? options
          : getSortedSelectOptions(options, selectOptionSort),
      selectOptionSort,
    })
  }

  return (
    <>
      <PropertySettingSubmenu
        icon={<ArrowDownUp />}
        label="Sort"
        options={selectOptionSortOptions}
        selectedValue={sort}
        onSelect={updateSort}
      />
      <DropDrawerSeparator />
      <DropDrawerLabel className="flex items-center justify-between pr-1">
        <span>Options</span>
        <button
          aria-label="Add select option"
          className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={addOption}
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </DropDrawerLabel>
      {options.length > 0 ? (
        options.map((option) => (
          <OptionEditorSubmenu
            key={option.id}
            onUpdateOption={updateOption}
            option={option}
          />
        ))
      ) : (
        <DropDrawerItem disabled>No options yet</DropDrawerItem>
      )}
    </>
  )
}

function StatusPropertyOptions({
  defaultOptionId,
  onUpdateConfig,
  options,
}: {
  defaultOptionId?: string
  onUpdateConfig: (config: DatabasePropertyConfig) => void
  options: StatusOption[]
}) {
  const groups = [
    {
      name: "To-do",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "To-do"
      ),
    },
    {
      name: "In progress",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "In progress"
      ),
    },
    {
      name: "Complete",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "Complete"
      ),
    },
  ]
  const resolvedDefaultOptionId = defaultOptionId ?? options[0]?.id
  const updateOption = (optionId: string, patch: Partial<StatusOption>) => {
    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option
      ),
    })
  }
  const setDefaultOption = (optionId: string) => {
    onUpdateConfig({
      defaultOptionId: optionId,
      options,
    })
  }

  return (
    <>
      {groups.map((group, groupIndex) => (
        <div key={group.name}>
          {groupIndex > 0 ? <DropDrawerSeparator /> : null}
          <DropDrawerLabel className="flex items-center justify-between pr-1">
            <span>{group.name}</span>
            <button
              aria-label={`Add ${group.name} status`}
              className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              type="button"
            >
              <Plus className="size-4" />
            </button>
          </DropDrawerLabel>
          {group.options.map((option) => (
            <OptionEditorSubmenu
              defaultOptionId={resolvedDefaultOptionId}
              key={option.id}
              onSetDefaultOption={setDefaultOption}
              onUpdateOption={updateOption}
              option={option}
              showDot
            />
          ))}
        </div>
      ))}
    </>
  )
}

function OptionEditorSubmenu({
  defaultOptionId,
  onSetDefaultOption,
  onUpdateOption,
  option,
  showDot = false,
}: {
  defaultOptionId?: string
  onSetDefaultOption?: (optionId: string) => void
  onUpdateOption: (optionId: string, patch: Partial<SelectOption>) => void
  option: SelectOption
  showDot?: boolean
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <GripVertical />
        <span className={getColorTokenBadgeClassName(option.color)}>
          {showDot ? (
            <span
              aria-hidden="true"
              className={getColorTokenDotClassName(option.color)}
            />
          ) : null}
          {option.name}
        </span>
        {option.id === defaultOptionId ? (
          <DropDrawerShortcut>DEFAULT</DropDrawerShortcut>
        ) : null}
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72">
        <div className="px-1.5 py-1">
          <Input
            aria-label={`${option.name} option name`}
            defaultValue={option.name}
            onBlur={(event) => {
              const nextName = event.target.value.trim()

              if (nextName && nextName !== option.name) {
                onUpdateOption(option.id, { name: nextName })
              }
            }}
            onKeyDown={(event) => {
              event.stopPropagation()

              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <DropDrawerItem disabled>
          <Trash2 />
          <span>Delete</span>
        </DropDrawerItem>
        {onSetDefaultOption ? (
          <DropDrawerItem
            onSelect={(event) => {
              event.preventDefault()
              onSetDefaultOption(option.id)
            }}
          >
            <Flag />
            <span>Set as default</span>
            {option.id === defaultOptionId ? <Check className="ml-auto" /> : null}
          </DropDrawerItem>
        ) : null}
        <DropDrawerSeparator />
        <DropDrawerLabel>Colors</DropDrawerLabel>
        {statusColorOptions.map((color) => (
          <DropDrawerItem
            key={color.name}
            onSelect={(event) => {
              event.preventDefault()
              onUpdateOption(option.id, {
                color: color.value ?? "default",
              })
            }}
          >
            <span
              aria-hidden="true"
              className={`size-4 rounded-sm border border-foreground/10 ${color.backgroundClass}`}
            />
            <span>{color.name}</span>
            {getColorTokenValue(option.color) === (color.value ?? "default") ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  )
}

const statusColorOptions = colorTokens

const filesLimitOptions = [
  {
    label: "1 file",
    value: "one_file",
  },
  {
    label: "No limit",
    value: "no_limit",
  },
] satisfies {
  label: string
  value: FilesLimitValue
}[]

const personLimitOptions = [
  {
    label: "1 Person",
    value: "one_person",
  },
  {
    label: "No limit",
    value: "no_limit",
  },
] satisfies {
  label: string
  value: PersonLimitValue
}[]

const personDefaultOptions = [
  {
    label: "No default",
    value: "no_default",
  },
  {
    icon: <UserRound />,
    label: "Created by",
    value: "created_by",
  },
] satisfies {
  icon?: ReactNode
  label: string
  value: PersonDefaultValue
}[]

const personNotificationsOptions = [
  {
    label: "Users and groups",
    value: "users_and_groups",
  },
  {
    label: "Users only",
    value: "users_only",
  },
  {
    label: "None",
    value: "none",
  },
] satisfies {
  label: string
  value: PersonNotificationsValue
}[]

const selectOptionSortOptions = [
  {
    label: "Manual",
    value: "manual",
  },
  {
    label: "Alphabetical",
    value: "alphabetical",
  },
  {
    label: "Reverse alphabetical",
    value: "reverse_alphabetical",
  },
] satisfies {
  label: string
  value: SelectOptionSortValue
}[]

function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find(
      (defaultOption) => defaultOption.name === option.name
    )?.group ??
    "To-do"
  )
}

function getStatusOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as DatabasePropertyConfig).options
      : null

  if (!Array.isArray(options) || options.length === 0) {
    return defaultStatusOptions
  }

  const validOptions = options.filter(
    (option): option is StatusOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string"
  )

  return validOptions.length > 0 ? validOptions : defaultStatusOptions
}

function getFilesConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object"
      ? (config as DatabasePropertyConfig)
      : {}

  return {
    filesLimit: isFilesLimitValue(parsedConfig.filesLimit)
      ? parsedConfig.filesLimit
      : "no_limit",
  }
}

function isFilesLimitValue(value: unknown): value is FilesLimitValue {
  return value === "one_file" || value === "no_limit"
}

function getPersonConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object"
      ? (config as DatabasePropertyConfig)
      : {}

  return {
    personDefault: isPersonDefaultValue(parsedConfig.personDefault)
      ? parsedConfig.personDefault
      : "no_default",
    personLimit: isPersonLimitValue(parsedConfig.personLimit)
      ? parsedConfig.personLimit
      : "no_limit",
    personNotifications: isPersonNotificationsValue(
      parsedConfig.personNotifications
    )
      ? parsedConfig.personNotifications
      : "users_only",
  }
}

function isPersonLimitValue(value: unknown): value is PersonLimitValue {
  return value === "one_person" || value === "no_limit"
}

function isPersonDefaultValue(value: unknown): value is PersonDefaultValue {
  return value === "no_default" || value === "created_by"
}

function isPersonNotificationsValue(
  value: unknown
): value is PersonNotificationsValue {
  return value === "users_and_groups" || value === "users_only" || value === "none"
}

function getSelectOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as DatabasePropertyConfig).options
      : null

  if (!Array.isArray(options)) {
    return []
  }

  return options.filter(
    (option): option is SelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string"
  )
}

function getSelectOptionSort(config: unknown): SelectOptionSortValue {
  if (
    !config ||
    typeof config !== "object" ||
    !("selectOptionSort" in config)
  ) {
    return "manual"
  }

  const selectOptionSort = (config as DatabasePropertyConfig).selectOptionSort

  return isSelectOptionSortValue(selectOptionSort) ? selectOptionSort : "manual"
}

function isSelectOptionSortValue(
  value: unknown
): value is SelectOptionSortValue {
  return (
    value === "manual" ||
    value === "alphabetical" ||
    value === "reverse_alphabetical"
  )
}

function isDatabaseSortDirection(
  value: unknown
): value is DatabaseSortDirection {
  return value === "ascending" || value === "descending"
}

function isDatabaseSortConfig(value: unknown): value is DatabaseSortConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as DatabaseSortConfig).column === "string" &&
    (value as DatabaseSortConfig).column.length > 0 &&
    isDatabaseSortDirection((value as DatabaseSortConfig).direction)
  )
}

export function getDatabaseSorts(config: unknown): DatabaseSortConfig[] {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    return []
  }

  const sorts = (config as DatabaseConfig).sorts

  if (Array.isArray(sorts)) {
    return sorts.filter(isDatabaseSortConfig)
  }

  const sort = (config as DatabaseConfig).sort

  return isDatabaseSortConfig(sort) ? [sort] : []
}

export function getDatabaseSort(config: unknown): DatabaseSortConfig | null {
  return getDatabaseSorts(config)[0] ?? null
}

function upsertDatabaseSort(
  sorts: DatabaseSortConfig[],
  nextSort: DatabaseSortConfig
) {
  const existingSortIndex = sorts.findIndex(
    (sort) => sort.column === nextSort.column
  )

  if (existingSortIndex === -1) {
    return [...sorts, nextSort]
  }

  return sorts.map((sort, index) =>
    index === existingSortIndex ? nextSort : sort
  )
}

function getSortedSelectOptions(
  options: SelectOption[],
  sort: SelectOptionSortValue
) {
  if (sort === "manual") {
    return options
  }

  const sortedOptions = [...options].sort((firstOption, secondOption) =>
    firstOption.name.localeCompare(secondOption.name, undefined, {
      sensitivity: "base",
    })
  )

  return sort === "reverse_alphabetical"
    ? sortedOptions.reverse()
    : sortedOptions
}

function getNextOptionColor(options: SelectOption[]) {
  return cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ?? "default"
}

function getUniqueOptionName(options: SelectOption[], baseName: string) {
  const optionNames = new Set(options.map((option) => option.name))

  if (!optionNames.has(baseName)) {
    return baseName
  }

  let index = 2

  while (optionNames.has(`${baseName} ${index}`)) {
    index += 1
  }

  return `${baseName} ${index}`
}

function getStatusDefaultOptionId(config: unknown) {
  if (!config || typeof config !== "object" || !("defaultOptionId" in config)) {
    return defaultStatusOptions[0]?.id
  }

  const defaultOptionId = (config as DatabasePropertyConfig).defaultOptionId

  return typeof defaultOptionId === "string"
    ? defaultOptionId
    : defaultStatusOptions[0]?.id
}

function getShowFullUrl(config: unknown) {
  if (!config || typeof config !== "object" || !("showFullUrl" in config)) {
    return false
  }

  return (config as DatabasePropertyConfig).showFullUrl === true
}

function getWrapContent(config: unknown) {
  if (!config || typeof config !== "object" || !("wrapContent" in config)) {
    return false
  }

  return (config as DatabasePropertyConfig).wrapContent === true
}

function getNameColumnConfig(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("nameColumn" in config)
  ) {
    return {}
  }

  const nameColumn = (config as DatabaseConfig).nameColumn

  return nameColumn && typeof nameColumn === "object" && !Array.isArray(nameColumn)
    ? nameColumn
    : {}
}

export function getNameColumnLabel(config: unknown) {
  const label = getNameColumnConfig(config).label

  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : "Name"
}

export function getNameColumnShowPageIcon(config: unknown) {
  const showPageIcon = getNameColumnConfig(config).showPageIcon

  return showPageIcon !== false
}

export function getNameColumnWrapContent(config: unknown) {
  const wrapContent = getNameColumnConfig(config).wrapContent

  return wrapContent !== false
}

function getMergedNameColumnConfig(
  config: unknown,
  nextConfig: DatabaseNameColumnConfig
) {
  return getMergedDatabaseConfig(config, {
    nameColumn: {
      ...getNameColumnConfig(config),
      ...nextConfig,
    },
  })
}

export function getMergedDatabaseConfig(
  config: unknown,
  nextConfig: Partial<DatabaseConfig>
) {
  return {
    ...(config && typeof config === "object" && !Array.isArray(config)
      ? config
      : {}),
    ...nextConfig,
  }
}

function getMergedPropertyConfig(
  config: unknown,
  nextConfig: DatabasePropertyConfig
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...nextConfig,
  }
}
