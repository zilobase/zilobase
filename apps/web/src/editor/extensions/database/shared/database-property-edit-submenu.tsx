import {
  ArrowDownUp,
  ArrowLeftRight,
  Bell,
  Calendar,
  Check,
  CircleUserRound,
  Flag,
  GripVertical,
  Hash,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useUpdateDatabaseProperty } from "@notelab/features/databases"
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
  type,
}: {
  children: ReactNode
  config?: unknown
  databaseId: string
  databasePropertyId: string
  type: string
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
          type={type}
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
    type === "date" ||
    type === "created_time" ||
    type === "edited_time"
  )
}

function DatabasePropertyEditMenuItems({
  config,
  databaseId,
  databasePropertyId,
  type,
}: {
  config?: unknown
  databaseId: string
  databasePropertyId: string
  type: string
}) {
  const updateProperty = useUpdateDatabaseProperty()
  const isStatusProperty = type === "status"
  const isSelectProperty = type === "select" || type === "multi_select"
  const isPersonProperty = type === "person"
  const isFilesProperty = type === "files"
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
    type === "date" ||
    type === "created_time" ||
    type === "edited_time"
    ? "w-80"
    : undefined
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
  onUpdateOption: (
    optionId: string,
    patch: Partial<DatabaseSelectOption>
  ) => void
  option: DatabaseSelectOption
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

function getNextOptionColor(options: DatabaseSelectOption[]) {
  return cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ?? "default"
}

function getUniqueOptionName(
  options: DatabaseSelectOption[],
  baseName: string
) {
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
