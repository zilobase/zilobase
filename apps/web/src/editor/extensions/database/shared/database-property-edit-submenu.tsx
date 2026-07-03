import {
  ArrowUpRight,
  ArrowDownUp,
  ArrowLeftRight,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  CircleUserRound,
  CircleHelp,
  Database,
  Flag,
  GripVertical,
  Hash,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react"
import { Reorder, useDragControls } from "framer-motion"
import { useEffect, useRef, useState, type ReactNode } from "react"

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  useAddDatabaseProperty,
  useUpdateDatabaseProperty,
} from "@notelab/features/databases"
import { usePages } from "@notelab/features/pages"
import {
  colorTokens,
  cyclingColorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
  getColorTokenValue,
} from "@/lib/color-tokens"

import { defaultStatusOptions } from "../constants"
import {
  dateFormatOptions,
  getDateFormatConfig,
  getTimeFormatConfig,
  timeFormatOptions,
  type DateFormatValue,
  type TimeFormatValue,
} from "./database-date-config"
import {
  getNumberDecimalPlaces,
  getNumberDisplayColor,
  getNumberDisplayDivideBy,
  getNumberDisplayShowNumber,
  getNumberDisplayStyle,
  getNumberFormat,
  getMergedPropertyConfig,
  getShowFullUrl,
  getStatusDefaultOptionId,
  type DatabaseNumberDisplayStyle,
  type DatabasePropertyConfig,
  type DatabaseSelectOption,
  type NumberDecimalPlacesValue,
} from "./database-view-config"
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items"

type StatusOption = DatabaseSelectOption & {
  group?: string
}

type FilesLimitValue = "one_file" | "no_limit"
type PersonDefaultValue = "no_default" | "created_by"
type PersonLimitValue = "one_person" | "no_limit"
type PersonNotificationsValue = "users_and_groups" | "users_only" | "none"
type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"

export function DatabasePropertyEditSubmenu({
  children,
  config,
  databaseId,
  databasePropertyId,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  type,
  workspaceId,
}: {
  children: ReactNode
  config?: unknown
  databaseId: string
  databasePropertyId: string
  sourceDatabaseId?: string
  sourceDatabaseName?: string
  sourcePropertyId?: string
  type: string
  workspaceId?: string | null
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>{children}</DropDrawerSubTrigger>
      <DropDrawerSubContent
        className={getDatabasePropertyEditSubmenuContentClassName(type)}
      >
        <DatabasePropertyEditMenuItems
          config={config}
          databaseId={databaseId}
          databasePropertyId={databasePropertyId}
          sourceDatabaseId={sourceDatabaseId}
          sourceDatabaseName={sourceDatabaseName}
          sourcePropertyId={sourcePropertyId}
          type={type}
          workspaceId={workspaceId}
        />
      </DropDrawerSubContent>
    </DropDrawerSub>
  )
}

export function hasDatabasePropertyEditSettings(type: string) {
  return (
    type === "number" ||
    type === "url" ||
    type === "status" ||
    type === "select" ||
    type === "multi_select" ||
    type === "person" ||
    type === "files" ||
    type === "relation" ||
    type === "date" ||
    type === "created_time" ||
    type === "edited_time"
  )
}

function DatabasePropertyEditMenuItems({
  config,
  databaseId,
  databasePropertyId,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  type,
  workspaceId,
}: {
  config?: unknown
  databaseId: string
  databasePropertyId: string
  sourceDatabaseId?: string
  sourceDatabaseName?: string
  sourcePropertyId?: string
  type: string
  workspaceId?: string | null
}) {
  const updateProperty = useUpdateDatabaseProperty()
  const isStatusProperty = type === "status"
  const isSelectProperty = type === "select" || type === "multi_select"
  const isPersonProperty = type === "person"
  const isFilesProperty = type === "files"
  const isRelationProperty = type === "relation"
  const isNumberProperty = type === "number"
  const isUrlProperty = type === "url"
  const isDateProperty =
    type === "date" || type === "created_time" || type === "edited_time"
  const showFullUrl = getShowFullUrl(config)
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

  if (isNumberProperty) {
    return (
      <NumberPropertyOptions
        config={getNumberPropertyConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    )
  }

  if (isUrlProperty) {
    return (
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
    )
  }

  if (isStatusProperty) {
    return (
      <StatusPropertyOptions
        defaultOptionId={statusDefaultOptionId}
        onUpdateConfig={updatePropertyConfig}
        options={statusOptions}
      />
    )
  }

  if (isSelectProperty) {
    return (
      <SelectPropertyOptions
        onUpdateConfig={updatePropertyConfig}
        options={selectOptions}
        sort={getSelectOptionSort(config)}
      />
    )
  }

  if (isPersonProperty) {
    return (
      <PersonPropertyOptions
        config={getPersonConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    )
  }

  if (isFilesProperty) {
    return (
      <FilesPropertyOptions
        config={getFilesConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    )
  }

  if (isRelationProperty) {
    return (
      <RelationPropertyOptions
        config={config}
        onUpdateConfig={updatePropertyConfig}
        sourceDatabaseId={sourceDatabaseId ?? databaseId}
        sourceDatabaseName={sourceDatabaseName}
        sourcePropertyId={sourcePropertyId}
        workspaceId={workspaceId}
      />
    )
  }

  if (isDateProperty) {
    return (
      <DatePropertyOptions
        dateFormat={getDateFormatConfig(config)}
        timeFormat={getTimeFormatConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    )
  }

  return <DropDrawerItem disabled>Property settings</DropDrawerItem>
}

function getDatabasePropertyEditSubmenuContentClassName(type: string) {
  return type === "number" ||
    type === "status" ||
    type === "select" ||
    type === "multi_select" ||
    type === "person" ||
    type === "files" ||
    type === "relation" ||
    type === "date" ||
    type === "created_time" ||
    type === "edited_time"
    ? "w-80"
    : undefined
}

type RelationDatabaseOption = DatabaseSearchableMenuOption & {
  pageName: string
}

function RelationPropertyOptions({
  config,
  onUpdateConfig,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  workspaceId,
}: {
  config?: unknown
  onUpdateConfig: (config: DatabasePropertyConfig) => void
  sourceDatabaseId: string
  sourceDatabaseName?: string
  sourcePropertyId?: string
  workspaceId?: string | null
}) {
  const relationConfig = getRelationConfig(config)
  const addProperty = useAddDatabaseProperty()
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    relationConfig.relatedDatabaseId ?? null
  )
  const [relatedPropertyName, setRelatedPropertyName] = useState(
    relationConfig.relatedPropertyName ?? ""
  )
  const { data: pages = [], isLoading } = usePages(workspaceId, {
    enabled: Boolean(workspaceId),
  })
  const databaseOptions = pages.flatMap((page) =>
    (page.databases ?? [])
      .filter((database) => database.id !== sourceDatabaseId)
      .map<RelationDatabaseOption>((database) => ({
        icon: <Database />,
        label: database.name || "Untitled database",
        pageName: page.name,
        searchText: `${database.name} ${page.name}`.trim(),
        value: database.id,
      }))
  )
  const selectedDatabase = selectedDatabaseId
    ? databaseOptions.find((option) => option.value === selectedDatabaseId)
    : null
  const limit = relationConfig.limit ?? "no_limit"
  const twoWayRelation = relationConfig.twoWayRelation ?? false
  const saveRelation = () => {
    if (!selectedDatabase) {
      return
    }

    const nextRelation = {
      ...relationConfig,
      relatedDatabaseId: selectedDatabase.value,
      relatedDatabaseName: selectedDatabase.label,
      relatedPageName: selectedDatabase.pageName,
      relatedPropertyName: relatedPropertyName.trim() || undefined,
      twoWayRelation,
    }

    if (!twoWayRelation || !relatedPropertyName.trim() || !sourcePropertyId) {
      onUpdateConfig({ relation: nextRelation })
      return
    }

    const reciprocalRelation = {
      limit,
      relatedDatabaseId: sourceDatabaseId,
      relatedDatabaseName: sourceDatabaseName,
      relatedPropertyId: sourcePropertyId,
      twoWayRelation: true,
    }

    addProperty.mutate(
      {
        config: {
          relation: reciprocalRelation,
        },
        databaseId: selectedDatabase.value,
        name: relatedPropertyName.trim(),
        type: "relation",
      },
      {
        onSuccess: (payload) => {
          const reciprocalProperty = payload.properties
            .filter(
              (property) =>
                property.property.type === "relation" &&
                property.property.name === relatedPropertyName.trim()
            )
            .at(-1)

          onUpdateConfig({
            relation: {
              ...nextRelation,
              relatedPropertyId: reciprocalProperty?.property.id,
            },
          })
        },
      }
    )
  }

  if (selectedDatabase) {
    return (
      <>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault()
            setSelectedDatabaseId(null)
          }}
        >
          <ChevronLeft />
          <span>Back</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <Database />
          <span>Related to</span>
          <span className="ml-auto max-w-36 truncate text-muted-foreground">
            {selectedDatabase.label}
          </span>
        </DropDrawerItem>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault()
            onUpdateConfig({
              relation: {
                ...relationConfig,
                limit: limit === "no_limit" ? "one_page" : "no_limit",
              },
            })
          }}
        >
          <Hash />
          <span>Limit</span>
          <span className="ml-auto text-muted-foreground">
            {limit === "one_page" ? "1 page" : "No limit"}
          </span>
        </DropDrawerItem>
        <DropDrawerItem
          aria-pressed={twoWayRelation}
          onSelect={(event) => {
            event.preventDefault()
            const nextTwoWayRelation = !twoWayRelation
            onUpdateConfig({
              relation: {
                ...relationConfig,
                relatedPropertyName: relatedPropertyName.trim() || undefined,
                twoWayRelation: nextTwoWayRelation,
              },
            })
          }}
        >
          <ArrowUpRight />
          <span>Two-way relation</span>
          <Switch
            checked={twoWayRelation}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        {twoWayRelation ? (
          <div className="px-2 py-1.5">
            <Input
              aria-label="Related property name"
              className="h-8"
              onChange={(event) => setRelatedPropertyName(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Related property name"
              value={relatedPropertyName}
            />
          </div>
        ) : null}
        <div className="px-2 py-1.5">
          <Button
            className="w-full"
            disabled={
              addProperty.isPending ||
              (twoWayRelation &&
                (!relatedPropertyName.trim() || !sourcePropertyId))
            }
            onClick={saveRelation}
            size="sm"
            type="button"
          >
            <Plus />
            <span>{addProperty.isPending ? "Adding..." : "Add relation"}</span>
          </Button>
        </div>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <CircleHelp />
          <span>Learn about relations</span>
        </DropDrawerItem>
      </>
    )
  }

  if (isLoading) {
    return <DropDrawerItem disabled>Loading databases...</DropDrawerItem>
  }

  return (
    <DatabaseSearchableMenuItems
      emptyMessage="No databases available."
      inputAriaLabel="Search relation databases"
      inputIcon={<Search className="size-4" />}
      inputPlaceholder="Search databases..."
      open
      options={databaseOptions}
      renderOption={(option) => {
        const databaseOption = option as RelationDatabaseOption

        return (
          <DropDrawerItem
            key={databaseOption.value}
            onSelect={(event) => {
              event.preventDefault()
              setSelectedDatabaseId(databaseOption.value)
            }}
          >
            <Database />
            <div className="min-w-0 flex-1">
              <div className="truncate">{databaseOption.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {databaseOption.pageName}
              </div>
            </div>
          </DropDrawerItem>
        )
      }}
    />
  )
}

function getRelationConfig(config: unknown): {
  limit?: "no_limit" | "one_page"
  relatedDatabaseId?: string
  relatedDatabaseName?: string
  relatedPageName?: string
  relatedPropertyId?: string
  relatedPropertyName?: string
  twoWayRelation?: boolean
} {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {}
  }

  const relationConfig = relation as {
    limit?: unknown
    relatedDatabaseId?: unknown
    relatedDatabaseName?: unknown
    relatedPageName?: unknown
    relatedPropertyId?: unknown
    relatedPropertyName?: unknown
    twoWayRelation?: unknown
  }

  return {
    limit:
      relationConfig.limit === "one_page" ||
      relationConfig.limit === "no_limit"
        ? relationConfig.limit
        : undefined,
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedDatabaseName:
      typeof relationConfig.relatedDatabaseName === "string"
        ? relationConfig.relatedDatabaseName
        : undefined,
    relatedPageName:
      typeof relationConfig.relatedPageName === "string"
        ? relationConfig.relatedPageName
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
    relatedPropertyName:
      typeof relationConfig.relatedPropertyName === "string"
        ? relationConfig.relatedPropertyName
        : undefined,
    twoWayRelation:
      typeof relationConfig.twoWayRelation === "boolean"
        ? relationConfig.twoWayRelation
        : undefined,
  }
}

function NumberPropertyOptions({
  config,
  onUpdateConfig,
}: {
  config: {
    numberDecimalPlaces: NumberDecimalPlacesValue
    numberDisplayColor: string
    numberDisplayDivideBy: number
    numberDisplayShowNumber: boolean
    numberDisplayStyle: DatabaseNumberDisplayStyle
    numberFormat: string
  }
  onUpdateConfig: (config: DatabasePropertyConfig) => void
}) {
  const showVisualOptions = config.numberDisplayStyle !== "number"

  return (
    <div className="space-y-1">
      <NumberFormatSettingSubmenu
        onSelect={(numberFormat) => onUpdateConfig({ numberFormat })}
        selectedValue={config.numberFormat}
      />
      <PropertySettingSubmenu
        icon={<Hash />}
        label="Decimal places"
        onSelect={(numberDecimalPlaces) => onUpdateConfig({ numberDecimalPlaces })}
        options={numberDecimalPlacesOptions}
        selectedValue={config.numberDecimalPlaces}
      />
      <DropDrawerSeparator />
      <DropDrawerLabel>Show as</DropDrawerLabel>
      <div className="grid grid-cols-3 gap-2 px-1.5 pb-1">
        {numberDisplayStyleOptions.map((option) => {
          const isSelected = option.value === config.numberDisplayStyle

          return (
            <button
              aria-pressed={isSelected}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? "border-primary bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              key={option.value}
              onClick={() => onUpdateConfig({ numberDisplayStyle: option.value })}
              type="button"
            >
              <option.preview />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
      {showVisualOptions ? (
        <div className="space-y-3 rounded-md border border-border/80 bg-muted/30 px-3 py-3">
          <PropertySettingSubmenu
            icon={
              <span
                aria-hidden="true"
                className={`size-4 rounded-sm border border-foreground/10 ${getColorSwatchClassName(config.numberDisplayColor)}`}
              />
            }
            label="Color"
            onSelect={(numberDisplayColor) => onUpdateConfig({ numberDisplayColor })}
            options={numberColorOptions}
            selectedValue={getColorTokenValue(config.numberDisplayColor)}
          />
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Divide by</label>
            <Input
              defaultValue={String(config.numberDisplayDivideBy)}
              inputMode="decimal"
              onBlur={(event) => {
                const nextValue = Number(event.target.value)

                if (Number.isFinite(nextValue) && nextValue > 0) {
                  onUpdateConfig({ numberDisplayDivideBy: nextValue })
                } else {
                  event.target.value = String(config.numberDisplayDivideBy)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
          <DropDrawerItem
            aria-pressed={config.numberDisplayShowNumber}
            className="rounded-md border border-transparent px-0 hover:bg-transparent focus:bg-transparent"
            onSelect={(event) => {
              event.preventDefault()
              onUpdateConfig({
                numberDisplayShowNumber: !config.numberDisplayShowNumber,
              })
            }}
          >
            <span>Show number</span>
            <Switch
              checked={config.numberDisplayShowNumber}
              className="ml-auto pointer-events-none"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        </div>
      ) : null}
    </div>
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
        onSelect={(nextDateFormat) => onUpdateConfig({ dateFormat: nextDateFormat })}
        options={dateFormatOptions}
        selectedValue={dateFormat}
      />
      <PropertySettingSubmenu
        icon={<Calendar />}
        label="Time format"
        onSelect={(nextTimeFormat) => onUpdateConfig({ timeFormat: nextTimeFormat })}
        options={timeFormatOptions}
        selectedValue={timeFormat}
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
      onSelect={(filesLimit) => onUpdateConfig({ filesLimit })}
      options={filesLimitOptions}
      selectedValue={config.filesLimit}
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
        onSelect={(personLimit) => onUpdateConfig({ personLimit })}
        options={personLimitOptions}
        selectedValue={config.personLimit}
      />
      <PropertySettingSubmenu
        icon={<CircleUserRound />}
        label="Default"
        onSelect={(personDefault) => onUpdateConfig({ personDefault })}
        options={personDefaultOptions}
        selectedValue={config.personDefault}
      />
      <PropertySettingSubmenu
        icon={<Bell />}
        label="Notifications"
        onSelect={(personNotifications) =>
          onUpdateConfig({ personNotifications })
        }
        options={personNotificationsOptions}
        selectedValue={config.personNotifications}
      />
    </>
  )
}

function PropertySettingSubmenu<TValue extends string | number>({
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

function NumberFormatSettingSubmenu({
  onSelect,
  selectedValue,
}: {
  onSelect: (value: string) => void
  selectedValue: string
}) {
  const [query, setQuery] = useState("")
  const filteredOptions = numberFormatOptions.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase())
  )
  const selectedOption =
    numberFormatOptions.find((option) => option.value === selectedValue) ??
    numberFormatOptions[0]

  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <Hash />
        <span className="flex-1">Number format</span>
        <span className="text-muted-foreground">{selectedOption?.label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72">
        <div className="px-1.5 py-1">
          <Input
            aria-label="Filter number formats"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter formats..."
            value={query}
          />
        </div>
        {filteredOptions.map((option) => (
          <DropDrawerItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault()
              onSelect(option.value)
            }}
          >
            <span>{option.label}</span>
            {option.value === selectedValue ? <Check className="ml-auto" /> : null}
          </DropDrawerItem>
        ))}
        {filteredOptions.length === 0 ? (
          <DropDrawerItem disabled>No matching formats</DropDrawerItem>
        ) : null}
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
  options: DatabaseSelectOption[]
  sort: SelectOptionSortValue
}) {
  const [showCreateInput, setShowCreateInput] = useState(false)
  const optionIds = options.map((option) => option.id)
  const [draftOptionIds, setDraftOptionIds] = useState<string[] | null>(null)
  const draftOptionIdsRef = useRef<string[] | null>(null)
  const draftOptionFrameRef = useRef<number | null>(null)
  const renderedOptionIds = draftOptionIds ?? optionIds
  const renderedOptions = reorderOptionsByIds(options, renderedOptionIds)
  useEffect(() => {
    if (
      draftOptionIds &&
      (areSameOrderedIds(draftOptionIds, optionIds) ||
        !haveSameIds(draftOptionIds, optionIds))
    ) {
      draftOptionIdsRef.current = null
      setDraftOptionIds(null)
    }
  }, [draftOptionIds, optionIds])
  const updateOption = (
    optionId: string,
    patch: Partial<DatabaseSelectOption>
  ) => {
    const nextOptions = options.map((option) =>
      option.id === optionId ? { ...option, ...patch } : option
    )

    onUpdateConfig({
      options: getSortedSelectOptions(nextOptions, sort),
    })
  }
  const addOption = (name: string) => {
    const nextOptions = [
      ...options,
      {
        color: getNextOptionColor(options),
        id: crypto.randomUUID(),
        name,
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
  const queueOptionReorder = (nextOptionIds: string[]) => {
    draftOptionIdsRef.current = nextOptionIds

    if (draftOptionFrameRef.current !== null) {
      return
    }

    draftOptionFrameRef.current = requestAnimationFrame(() => {
      draftOptionFrameRef.current = null
      const latestOptionIds = draftOptionIdsRef.current

      if (!latestOptionIds) {
        return
      }

      setDraftOptionIds((currentOptionIds) =>
        areSameOrderedIds(currentOptionIds ?? optionIds, latestOptionIds)
          ? currentOptionIds
          : latestOptionIds
      )
    })
  }
  const commitOptionReorder = () => {
    const nextOptionIds = draftOptionIdsRef.current

    if (!nextOptionIds) {
      return
    }

    if (draftOptionFrameRef.current !== null) {
      cancelAnimationFrame(draftOptionFrameRef.current)
      draftOptionFrameRef.current = null
    }

    draftOptionIdsRef.current = null
    setDraftOptionIds(nextOptionIds)

    if (areSameOrderedIds(nextOptionIds, optionIds)) {
      setDraftOptionIds(null)
      return
    }

    onUpdateConfig({
      options: reorderOptionsByIds(options, nextOptionIds),
      selectOptionSort: "manual",
    })
  }

  return (
    <>
      <PropertySettingSubmenu
        icon={<ArrowDownUp />}
        label="Sort"
        onSelect={updateSort}
        options={selectOptionSortOptions}
        selectedValue={sort}
      />
      <DropDrawerSeparator />
      <DropDrawerLabel className="flex items-center justify-between pr-1">
        <span>Options</span>
        <button
          aria-label="Add select option"
          className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => setShowCreateInput(true)}
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </DropDrawerLabel>
      {showCreateInput ? (
        <OptionCreateInput
          ariaLabel="New select option name"
          onCancel={() => setShowCreateInput(false)}
          onCreate={(name) => {
            addOption(name)
            setShowCreateInput(false)
          }}
          placeholder="New option"
        />
      ) : null}
      {options.length > 0 ? (
        <Reorder.Group
          as="div"
          axis="y"
          layoutScroll
          values={renderedOptionIds}
          onReorder={queueOptionReorder}
        >
          {renderedOptions.map((option) => (
            <OptionEditorSubmenu
              draggable
              key={option.id}
              onDragEnd={commitOptionReorder}
              onUpdateOption={updateOption}
              option={option}
            />
          ))}
        </Reorder.Group>
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
  const [creatingGroupName, setCreatingGroupName] = useState<string | null>(null)
  const [draftGroupOptionIdsByName, setDraftGroupOptionIdsByName] = useState<
    Record<string, string[]>
  >({})
  const draftGroupOptionIdsByNameRef = useRef<Record<string, string[]>>({})
  const draftGroupOptionFrameRef = useRef<number | null>(null)
  useEffect(() => {
    const nextDrafts = { ...draftGroupOptionIdsByNameRef.current }
    let changed = false

    for (const group of groups) {
      const draftOptionIds = nextDrafts[group.name]
      const groupOptionIds = group.options.map((option) => option.id)

      if (
        draftOptionIds &&
        (areSameOrderedIds(draftOptionIds, groupOptionIds) ||
          !haveSameIds(draftOptionIds, groupOptionIds))
      ) {
        delete nextDrafts[group.name]
        changed = true
      }
    }

    if (changed) {
      draftGroupOptionIdsByNameRef.current = nextDrafts
      setDraftGroupOptionIdsByName(nextDrafts)
    }
  }, [options])
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
  const addOption = (groupName: string, name: string) => {
    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: [
        ...options,
        {
          color: getNextOptionColor(options),
          group: groupName,
          id: crypto.randomUUID(),
          name,
        },
      ],
    })
  }
  const setDraftGroupOptionIds = (groupName: string, optionIds: string[]) => {
    draftGroupOptionIdsByNameRef.current = {
      ...draftGroupOptionIdsByNameRef.current,
      [groupName]: optionIds,
    }

    if (draftGroupOptionFrameRef.current !== null) {
      return
    }

    draftGroupOptionFrameRef.current = requestAnimationFrame(() => {
      draftGroupOptionFrameRef.current = null
      setDraftGroupOptionIdsByName({
        ...draftGroupOptionIdsByNameRef.current,
      })
    })
  }
  const clearDraftGroupOptionIds = (groupName: string) => {
    if (draftGroupOptionFrameRef.current !== null) {
      cancelAnimationFrame(draftGroupOptionFrameRef.current)
      draftGroupOptionFrameRef.current = null
    }

    const nextDrafts = { ...draftGroupOptionIdsByNameRef.current }
    delete nextDrafts[groupName]
    draftGroupOptionIdsByNameRef.current = nextDrafts

    setDraftGroupOptionIdsByName((drafts) => {
      const nextStateDrafts = { ...drafts }
      delete nextStateDrafts[groupName]

      return nextStateDrafts
    })
  }
  const commitGroupOptionReorder = (
    groupName: string,
    groupOptions: StatusOption[]
  ) => {
    const draftOptionIds = draftGroupOptionIdsByNameRef.current[groupName]

    if (!draftOptionIds) {
      return
    }

    if (
      areSameOrderedIds(
        draftOptionIds,
        groupOptions.map((option) => option.id)
      )
    ) {
      clearDraftGroupOptionIds(groupName)
      return
    }

    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: reorderStatusGroupOptions(options, groupName, draftOptionIds),
    })
  }

  return (
    <>
      {groups.map((group, groupIndex) => {
        const groupOptionIds = group.options.map((option) => option.id)
        const renderedOptionIds =
          draftGroupOptionIdsByName[group.name] ?? groupOptionIds
        const renderedOptions = reorderOptionsByIds(
          group.options,
          renderedOptionIds
        )

        return (
          <div key={group.name}>
            {groupIndex > 0 ? <DropDrawerSeparator /> : null}
            <DropDrawerLabel className="flex items-center justify-between pr-1">
              <span>{group.name}</span>
              <button
                aria-label={`Add ${group.name} status`}
                className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setCreatingGroupName(group.name)}
                type="button"
              >
                <Plus className="size-4" />
              </button>
            </DropDrawerLabel>
          <Reorder.Group
            as="div"
            axis="y"
            layoutScroll
            values={renderedOptionIds}
            onReorder={(optionIds) =>
              setDraftGroupOptionIds(group.name, optionIds)
            }
          >
            {renderedOptions.map((option) => (
              <OptionEditorSubmenu
                defaultOptionId={resolvedDefaultOptionId}
                draggable
                key={option.id}
                onDragEnd={() =>
                  commitGroupOptionReorder(group.name, group.options)
                }
                onSetDefaultOption={setDefaultOption}
                onUpdateOption={updateOption}
                option={option}
                showDot
              />
            ))}
          </Reorder.Group>
          {creatingGroupName === group.name ? (
            <OptionCreateInput
              ariaLabel={`New ${group.name} status name`}
              onCancel={() => setCreatingGroupName(null)}
              onCreate={(name) => {
                addOption(group.name, name)
                setCreatingGroupName(null)
              }}
              placeholder="New status"
            />
          ) : null}
          </div>
        )
      })}
    </>
  )
}

function OptionCreateInput({
  ariaLabel,
  onCancel,
  onCreate,
  placeholder,
}: {
  ariaLabel: string
  onCancel: () => void
  onCreate: (name: string) => void
  placeholder: string
}) {
  const [name, setName] = useState("")

  return (
    <div className="px-1.5 py-1">
      <Input
        aria-label={ariaLabel}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()

          if (event.key === "Enter") {
            event.preventDefault()

            const nextName = name.trim()

            if (nextName) {
              onCreate(nextName)
            }
          }

          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder={placeholder}
        value={name}
      />
    </div>
  )
}

function OptionEditorSubmenu({
  defaultOptionId,
  draggable = false,
  onDragEnd,
  onSetDefaultOption,
  onUpdateOption,
  option,
  showDot = false,
}: {
  defaultOptionId?: string
  draggable?: boolean
  onDragEnd?: () => void
  onSetDefaultOption?: (optionId: string) => void
  onUpdateOption: (
    optionId: string,
    patch: Partial<DatabaseSelectOption>
  ) => void
  option: DatabaseSelectOption
  showDot?: boolean
}) {
  const dragControls = useDragControls()
  const content = (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <span
          aria-label={`Drag ${option.name} option`}
          className="inline-flex size-4 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={(event) => {
            if (!draggable) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
            dragControls.start(event)
          }}
          role="button"
          tabIndex={-1}
        >
          <GripVertical />
        </span>
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

  if (!draggable) {
    return content
  }

  return (
    <Reorder.Item
      as="div"
      className="rounded-md"
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      value={option.id}
      whileDrag={{ scale: 0.995 }}
    >
      {content}
    </Reorder.Item>
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

const numberFormatOptions = [
  { label: "Number", value: "number" },
  { label: "Number with separators", value: "number_with_separators" },
  { label: "Percent", value: "percent" },
  { label: "US Dollar (USD)", value: "usd" },
  { label: "Australian dollar (AUD)", value: "aud" },
  { label: "Canadian dollar (CAD)", value: "cad" },
  { label: "Singapore dollar (SGD)", value: "sgd" },
  { label: "Euro (EUR)", value: "eur" },
  { label: "Pound (GBP)", value: "gbp" },
  { label: "Yen (JPY)", value: "jpy" },
  { label: "Ruble (RUB)", value: "rub" },
  { label: "Rupee (INR)", value: "inr" },
  { label: "Won (KRW)", value: "krw" },
  { label: "Yuan (CNY)", value: "cny" },
  { label: "Real (BRL)", value: "brl" },
  { label: "Lira (TRY)", value: "try" },
  { label: "Rupiah (IDR)", value: "idr" },
  { label: "Franc (CHF)", value: "chf" },
  { label: "Hong Kong dollar (HKD)", value: "hkd" },
  { label: "New Zealand dollar (NZD)", value: "nzd" },
  { label: "Swedish krona (SEK)", value: "sek" },
  { label: "Norwegian krone (NOK)", value: "nok" },
  { label: "Mexican peso (MXN)", value: "mxn" },
  { label: "Rand (ZAR)", value: "zar" },
  { label: "New Taiwan dollar (TWD)", value: "twd" },
  { label: "Danish krone (DKK)", value: "dkk" },
  { label: "Polish zloty (PLN)", value: "pln" },
  { label: "Thai baht (THB)", value: "thb" },
  { label: "UAE dirham (AED)", value: "aed" },
  { label: "Argentine peso (ARS)", value: "ars" },
  { label: "Chilean peso (CLP)", value: "clp" },
  { label: "Colombian peso (COP)", value: "cop" },
  { label: "Saudi riyal (SAR)", value: "sar" },
] satisfies {
  label: string
  value: string
}[]

const numberDecimalPlacesOptions = [
  { label: "Default", value: "default" },
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
] satisfies {
  label: string
  value: NumberDecimalPlacesValue
}[]

const numberColorOptions = statusColorOptions.map((color) => ({
  icon: (
    <span
      aria-hidden="true"
      className={`size-4 rounded-sm border border-foreground/10 ${color.backgroundClass}`}
    />
  ),
  label: color.name,
  value: color.value ?? "default",
}))

const numberDisplayStyleOptions = [
  {
    label: "Number",
    preview: NumberDisplayPreview,
    value: "number",
  },
  {
    label: "Bar",
    preview: BarDisplayPreview,
    value: "bar",
  },
  {
    label: "Ring",
    preview: RingDisplayPreview,
    value: "ring",
  },
] satisfies {
  label: string
  preview: () => ReactNode
  value: DatabaseNumberDisplayStyle
}[]

function NumberDisplayPreview() {
  return <span className="text-2xl font-semibold leading-none text-primary">42</span>
}

function BarDisplayPreview() {
  return (
    <span className="flex h-3 w-16 items-center rounded-full bg-muted">
      <span className="h-2 w-9 rounded-full bg-primary" />
    </span>
  )
}

function RingDisplayPreview() {
  return (
    <svg
      aria-hidden="true"
      className="size-8 text-primary"
      viewBox="0 0 24 24"
    >
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="8"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="8"
        stroke="currentColor"
        strokeDasharray="50.24"
        strokeDashoffset="12.56"
        strokeLinecap="round"
        strokeWidth="3"
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}

function getColorSwatchClassName(color?: string | null) {
  const resolvedColor = getColorTokenValue(color)

  return (
    colorTokens.find((token) => (token.value ?? "default") === resolvedColor)
      ?.backgroundClass ?? colorTokens[0]?.backgroundClass ?? "bg-background"
  )
}

function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find(
      (defaultOption) => defaultOption.name === option.name
    )?.group ??
    "To-do"
  )
}

function getNumberPropertyConfig(config: unknown) {
  return {
    numberDecimalPlaces: getNumberDecimalPlaces(config),
    numberDisplayColor: getNumberDisplayColor(config),
    numberDisplayDivideBy: getNumberDisplayDivideBy(config),
    numberDisplayShowNumber: getNumberDisplayShowNumber(config),
    numberDisplayStyle: getNumberDisplayStyle(config),
    numberFormat: getNumberFormat(config),
  }
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
    (option): option is DatabaseSelectOption =>
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

function getSortedSelectOptions(
  options: DatabaseSelectOption[],
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

function reorderOptionsByIds<TOption extends { id: string }>(
  options: TOption[],
  optionIds: string[]
) {
  const optionsById = new Map(options.map((option) => [option.id, option]))
  const orderedOptions = optionIds.flatMap((optionId) => {
    const option = optionsById.get(optionId)

    return option ? [option] : []
  })
  const remainingOptions = options.filter(
    (option) => !optionIds.includes(option.id)
  )

  return [...orderedOptions, ...remainingOptions]
}

function reorderStatusGroupOptions(
  options: StatusOption[],
  groupName: string,
  optionIds: string[]
) {
  const reorderedGroupOptions = reorderOptionsByIds(
    options.filter((option) => getStatusOptionGroup(option) === groupName),
    optionIds
  )
  let nextGroupIndex = 0

  return options.map((option) => {
    if (getStatusOptionGroup(option) !== groupName) {
      return option
    }

    const nextOption = reorderedGroupOptions[nextGroupIndex]
    nextGroupIndex += 1

    return nextOption ?? option
  })
}

function areSameOrderedIds(firstIds: string[], secondIds: string[]) {
  return (
    firstIds.length === secondIds.length &&
    firstIds.every((id, index) => id === secondIds[index])
  )
}

function haveSameIds(firstIds: string[], secondIds: string[]) {
  if (firstIds.length !== secondIds.length) {
    return false
  }

  const secondIdSet = new Set(secondIds)

  return firstIds.every((id) => secondIdSet.has(id))
}

function getNextOptionColor(options: DatabaseSelectOption[]) {
  return cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ?? "default"
}
