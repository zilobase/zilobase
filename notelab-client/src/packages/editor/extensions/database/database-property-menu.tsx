import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronsUpDown,
  ChevronDown,
  Copy,
  EyeOff,
  Flag,
  Filter,
  GripVertical,
  Pin,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react"

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
import { useUpdateDatabaseProperty } from "@/features/databases/hooks"
import { colorTokens } from "@/packages/editor/components/editor/toolbar-data"

import { defaultStatusOptions, getDatabasePropertyType } from "./constants"

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
  defaultOptionId?: string
  options?: SelectOption[]
}

export function DatabasePropertyMenu({
  config,
  databaseId,
  databasePropertyId,
  name,
  onRename,
  type,
}: {
  config?: unknown
  databaseId: string
  databasePropertyId: string
  name: string
  onRename: (name: string) => void
  type: string
}) {
  const updateProperty = useUpdateDatabaseProperty()
  const propertyType = getDatabasePropertyType(type)
  const PropertyIcon = propertyType.icon
  const isStatusProperty = type === "status"
  const isSelectProperty = type === "select" || type === "multi_select"
  const statusDefaultOptionId = getStatusDefaultOptionId(config)
  const statusOptions = getStatusOptions(config)
  const selectOptions = getSelectOptions(config)
  const updatePropertyConfig = (nextConfig: DatabasePropertyConfig) => {
    updateProperty.mutate({
      config: getStatusConfig(config, nextConfig),
      databaseId,
      databasePropertyId,
    })
  }

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
          <DropDrawerSubContent
            className={isStatusProperty || isSelectProperty ? "w-72" : undefined}
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
              />
            ) : (
              <DropDrawerItem disabled>Property settings</DropDrawerItem>
            )}
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

function SelectPropertyOptions({
  onUpdateConfig,
  options,
}: {
  onUpdateConfig: (config: DatabasePropertyConfig) => void
  options: SelectOption[]
}) {
  const updateOption = (optionId: string, patch: Partial<SelectOption>) => {
    onUpdateConfig({
      options: options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option
      ),
    })
  }
  const addOption = () => {
    const optionName = getUniqueOptionName(options, "Option")

    onUpdateConfig({
      options: [
        ...options,
        {
          color: getNextOptionColor(options),
          id: crypto.randomUUID(),
          name: optionName,
        },
      ],
    })
  }

  return (
    <>
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
}: {
  defaultOptionId?: string
  onSetDefaultOption?: (optionId: string) => void
  onUpdateOption: (optionId: string, patch: Partial<SelectOption>) => void
  option: SelectOption
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <GripVertical />
        <span className={getStatusBadgeClassName(option.color)}>
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
            {getStatusColorValue(option.color) === (color.value ?? "default") ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  )
}

const statusColorOptions = colorTokens
const cyclingColorTokens = colorTokens.filter((token) => token.value)

function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find(
      (defaultOption) => defaultOption.name === option.name
    )?.group ??
    "To-do"
  )
}

function getStatusColorToken(color?: string | null) {
  if (!color || color === "default") {
    return colorTokens[0]
  }

  return (
    colorTokens.find(
      (token) =>
        token.value === color || token.name.toLowerCase() === color.toLowerCase()
    ) ?? colorTokens[0]
  )
}

function getStatusColorValue(color?: string | null) {
  return getStatusColorToken(color).value ?? "default"
}

function getStatusBadgeClassName(color?: string | null) {
  const token = getStatusColorToken(color)

  return `database-select-badge ${token.backgroundClass}`
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

function getStatusConfig(
  config: unknown,
  nextConfig: DatabasePropertyConfig
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...nextConfig,
  }
}
