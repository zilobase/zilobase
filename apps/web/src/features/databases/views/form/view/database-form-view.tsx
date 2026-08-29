import {
  AlignLeft,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpToLine,
  Asterisk,
  CalendarIcon,
  Database,
  MoreHorizontal,
  MoveVertical,
  Plus,
  Trash2,
} from "@/shared/components/icons"
import { useState, type ReactNode } from "react"

import { PageMetadata } from "../../../components/page-metadata"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { Input } from "@/shared/ui/input"
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import type { DatabaseProperty } from "@zilobase/features/databases"

import {
  getDatabasePropertyCellKind,
  getDatabasePropertyType,
  getNextDatabaseOptionColor,
} from "../../../core/database-property-types"
import { DatabasePropertyDate } from "../../../properties/editors/database-property-date"
import { formatDatabaseDateValue } from "../../../properties/model/database-date-config"
import { getColorTokenDotClassName } from "@/shared/lib/color-tokens"
import { cn } from "@/shared/lib/utils"
import {
  getDatabasePropertyOrder,
  getPersonLimit,
  getViewHiddenPropertyIds,
} from "../../model/database-view-config"
import { useDatabaseViewContext } from "../../model/database-view-context"
import { getDatabaseFormHeaderSettings } from "../model/database-form-header-config"
import {
  getDatabaseFormQuestionSettings,
  moveDatabaseFormQuestion,
  type DatabaseFormQuestionMove,
  type DatabaseFormQuestionSettings,
  type DatabaseFormQuestionSettingsPatch,
} from "../model/database-form-question-config"
import {
  getFormOptions,
  getFormQuestionDescription,
  isOptionProperty,
  type FormOption,
} from "../model/database-form-options"

type FormQuestionEntry = {
  id: string
  property?: DatabaseProperty
  propertyName: string
  type: string
}

export function DatabaseFormView({ preview = false }: { preview?: boolean }) {
  const {
    activeView,
    databaseId,
    databasePageId,
    databaseWorkspaceId,
    editable,
    personOptions,
    properties,
    renameDatabaseProperty,
    saveDatabasePropertyOrder,
    titlePropertyLabel,
    togglePropertyVisibility,
    updateDatabaseFormHeaderSettings,
    updateDatabaseFormQuestionSettings,
    updateDatabasePropertyConfig,
    updateNameColumnConfig,
    visibleProperties,
  } = useDatabaseViewContext()
  const [previewTitle, setPreviewTitle] = useState("")
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  )
  const canEditQuestions = editable && !preview
  const headerSettings = getDatabaseFormHeaderSettings(activeView?.config)
  const hiddenPropertyIds = new Set(
    getViewHiddenPropertyIds(activeView?.config),
  )
  const addableProperties = properties.filter(
    (property) =>
      !visibleProperties.some(
        (visibleProperty) => visibleProperty.id === property.id,
      ),
  )
  const questionOrder = getDatabasePropertyOrder(activeView?.config)
  const questionOrderIndexes = new Map(
    questionOrder.map((propertyId, index) => [propertyId, index]),
  )
  const questions: FormQuestionEntry[] = [
    ...(hiddenPropertyIds.has("name")
      ? []
      : [
          {
            id: "name",
            propertyName: titlePropertyLabel,
            type: "title",
          },
        ]),
    ...visibleProperties.map((property) => ({
      id: property.id,
      property,
      propertyName: property.property.name,
      type: property.property.type,
    })),
  ].sort(
    (left, right) =>
      (questionOrderIndexes.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (questionOrderIndexes.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  )
  const questionIds = questions.map((question) => question.id)
  const TitleIcon = getDatabasePropertyType("text").icon

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 py-10 sm:py-14">
      <PageMetadata
        compact
        contentClassName="sm:!px-8"
        cover={headerSettings.cover}
        databaseId={databaseId}
        description={headerSettings.description}
        descriptionPlaceholder="Description (optional)"
        editable={canEditQuestions}
        enableComments={false}
        headingLabel="Form"
        icon={headerSettings.icon}
        iconPosition={headerSettings.iconPosition}
        layoutSection="heading"
        onCoverChange={(cover) =>
          updateDatabaseFormHeaderSettings?.({ cover })
        }
        onDescriptionChange={(description) =>
          updateDatabaseFormHeaderSettings?.({ description })
        }
        onIconChange={(icon) =>
          updateDatabaseFormHeaderSettings?.({ icon })
        }
        onIconPositionChange={(iconPosition) =>
          updateDatabaseFormHeaderSettings?.({ iconPosition })
        }
        onTitleChange={(title) =>
          updateDatabaseFormHeaderSettings?.({ title })
        }
        title={headerSettings.title}
        titlePlaceholder="Form title"
        workspaceId={databaseWorkspaceId}
        pageId={databasePageId}
      />

      <div className="space-y-10 px-4 sm:px-8">
        {questions.map((question, questionIndex) => {
          const settings = getDatabaseFormQuestionSettings(
            activeView?.config,
            question.id,
            question.propertyName,
          )
          const updateQuestion = (
            patch: DatabaseFormQuestionSettingsPatch,
          ) => updateDatabaseFormQuestionSettings?.(question.id, patch)
          const property = question.property

          return (
            <FormQuestion
              defaultDescription={
                property ? getFormQuestionDescription(property) : undefined
              }
              editable={canEditQuestions}
              footer={
                canEditQuestions && property && isOptionProperty(property) ? (
                  <Button
                    className="relative z-10 h-8 gap-2 px-1 text-content-secondary"
                    onClick={(event) => {
                      event.stopPropagation()
                      void addFormPropertyOption(
                        property,
                        updateDatabasePropertyConfig,
                      )
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <Plus />
                    Add option
                  </Button>
                ) : null
              }
              interactive={preview}
              key={question.id}
              onDescriptionChange={(description) =>
                updateQuestion({ description })
              }
              onLabelChange={(label) => updateQuestion({ label })}
              onLinkedPropertyRename={(name) => {
                if (question.id === "name") {
                  void updateNameColumnConfig?.({ label: name })
                  return
                }

                renameDatabaseProperty(question.id, name)
              }}
              onMove={(destination) =>
                saveDatabasePropertyOrder(
                  moveDatabaseFormQuestion(
                    questionIds,
                    question.id,
                    destination,
                  ),
                )
              }
              onOpenChange={(open) =>
                setSelectedQuestionId(open ? question.id : null)
              }
              onRemove={() => togglePropertyVisibility(question.id)}
              onUpdate={updateQuestion}
              open={selectedQuestionId === question.id}
              position={{
                first: questionIndex === 0,
                last: questionIndex === questions.length - 1,
              }}
              propertyName={question.propertyName}
              settings={settings}
              type={question.type}
            >
              {property ? (
                <DatabaseFormPropertyControl
                  interactive={preview}
                  longAnswer={settings.longAnswer}
                  personOptions={personOptions}
                  property={property}
                  required={settings.required}
                />
              ) : settings.longAnswer ? (
                <Textarea
                  aria-label={`${settings.label} preview`}
                  aria-required={settings.required}
                  onChange={(event) => setPreviewTitle(event.target.value)}
                  placeholder={preview ? "Your answer" : "Respondent's answer"}
                  required={settings.required}
                  value={previewTitle}
                />
              ) : (
                <Input
                  aria-label={`${settings.label} preview`}
                  aria-required={settings.required}
                  onChange={(event) => setPreviewTitle(event.target.value)}
                  placeholder={preview ? "Your answer" : "Respondent's answer"}
                  required={settings.required}
                  value={previewTitle}
                />
              )}
            </FormQuestion>
          )
        })}

        {canEditQuestions ? (
          <DropDrawer>
            <DropDrawerTrigger asChild>
              <Button className="gap-2" type="button" variant="ghost">
                <Plus />
                Add question
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent align="start" className="w-64">
              {hiddenPropertyIds.has("name") ? (
                <DropDrawerItem
                  onSelect={() => togglePropertyVisibility("name")}
                >
                  <TitleIcon />
                  <span>{titlePropertyLabel}</span>
                </DropDrawerItem>
              ) : null}
              {addableProperties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(
                  property.property.type,
                ).icon

                return (
                  <DropDrawerItem
                    key={property.id}
                    onSelect={() => togglePropertyVisibility(property.id)}
                  >
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                  </DropDrawerItem>
                )
              })}
              {addableProperties.length === 0 &&
              !hiddenPropertyIds.has("name") ? (
                <DropDrawerItem disabled>
                  <span>All properties are already included</span>
                </DropDrawerItem>
              ) : null}
            </DropDrawerContent>
          </DropDrawer>
        ) : null}

        {preview ? (
          <Button className="h-10 w-full" type="button">
            Submit
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FormQuestion({
  children,
  defaultDescription,
  editable,
  footer,
  interactive,
  onDescriptionChange,
  onLabelChange,
  onLinkedPropertyRename,
  onMove,
  onOpenChange,
  onRemove,
  onUpdate,
  open,
  position,
  propertyName,
  settings,
  type,
}: {
  children: ReactNode
  defaultDescription?: string
  editable: boolean
  footer?: ReactNode
  interactive: boolean
  onDescriptionChange: (description: string) => void
  onLabelChange: (label: string) => void
  onLinkedPropertyRename: (name: string) => void
  onMove: (destination: DatabaseFormQuestionMove) => void
  onOpenChange: (open: boolean) => void
  onRemove: () => void
  onUpdate: (patch: DatabaseFormQuestionSettingsPatch) => void
  open: boolean
  position: { first: boolean; last: boolean }
  propertyName: string
  settings: DatabaseFormQuestionSettings
  type: string
}) {
  return (
    <DropDrawer open={open} onOpenChange={onOpenChange}>
      <section
        className={cn(
          "group/question relative space-y-4",
          !interactive &&
            "cursor-pointer rounded-xl border border-action-selected-border bg-surface-card p-5 transition-colors hover:border-action-selected-border sm:p-6",
          open && "border-action-selected-border ring-1 ring-action-selected-border",
        )}
        onClick={() => editable && onOpenChange(true)}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {editable && !settings.syncWithPropertyName ? (
              <Input
                aria-label="Question name"
                className="relative z-10 h-auto border-0 bg-transparent p-0 text-lg font-semibold tracking-tight shadow-none focus-visible:ring-0"
                defaultValue={settings.label}
                key={settings.label}
                onBlur={(event) => {
                  const label = event.target.value.trim()
                  if (label && label !== settings.label) onLabelChange(label)
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
            ) : (
              <h3 className="text-lg font-semibold tracking-tight">
                {settings.label}
                {settings.required ? (
                  <span className="ml-1 text-action-danger-text" aria-hidden>
                    *
                  </span>
                ) : null}
              </h3>
            )}
            {settings.descriptionEnabled ? (
              editable ? (
                <Input
                  aria-label={`${settings.label} description`}
                  className="relative z-10 h-auto border-0 bg-transparent p-0 text-sm text-content-secondary shadow-none focus-visible:ring-0"
                  defaultValue={settings.description}
                  key={settings.description}
                  onBlur={(event) =>
                    onDescriptionChange(event.target.value.trim())
                  }
                  onClick={(event) => event.stopPropagation()}
                  placeholder="Description (optional)"
                />
              ) : settings.description ? (
                <p className="text-sm text-content-secondary">
                  {settings.description}
                </p>
              ) : null
            ) : null}
            {defaultDescription ? (
              <p className="text-sm text-content-secondary">
                {defaultDescription}
              </p>
            ) : null}
          </div>
          {editable ? (
            <DropDrawerTrigger asChild>
              <Button
                aria-label={`${settings.label} question options`}
                className={cn(
                  "relative z-10 text-content-secondary opacity-0 group-focus-within/question:opacity-100 group-hover/question:opacity-100",
                  open && "bg-action-neutral-hover opacity-100",
                )}
                onClick={(event) => event.stopPropagation()}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </DropDrawerTrigger>
          ) : null}
        </div>
        <div inert={interactive ? undefined : true}>{children}</div>
        {footer}
      </section>
      {editable ? (
        <QuestionOptions
          onLinkedPropertyRename={onLinkedPropertyRename}
          onMove={onMove}
          onRemove={onRemove}
          onUpdate={onUpdate}
          position={position}
          propertyName={propertyName}
          settings={settings}
          type={type}
        />
      ) : null}
    </DropDrawer>
  )
}

function QuestionOptions({
  onLinkedPropertyRename,
  onMove,
  onRemove,
  onUpdate,
  position,
  propertyName,
  settings,
  type,
}: {
  onLinkedPropertyRename: (name: string) => void
  onMove: (destination: DatabaseFormQuestionMove) => void
  onRemove: () => void
  onUpdate: (patch: DatabaseFormQuestionSettingsPatch) => void
  position: { first: boolean; last: boolean }
  propertyName: string
  settings: DatabaseFormQuestionSettings
  type: string
}) {
  const isTitle = type === "title"
  const propertyType = getDatabasePropertyType(isTitle ? "text" : type)
  const PropertyIcon = propertyType.icon
  const typeLabel = isTitle ? "Title" : propertyType.label
  const acceptsAnswers = ![
    "created_time",
    "edited_time",
    "formula",
    "id",
    "rollup",
  ].includes(type)

  return (
    <DropDrawerContent
      align="end"
      className="w-72"
      onCloseAutoFocus={(event) => event.preventDefault()}
      side="left"
    >
      <DropDrawerLabel className="py-2 text-sm font-semibold text-content-primary">
        Question options
      </DropDrawerLabel>
      {acceptsAnswers ? (
        <QuestionOptionSwitch
          checked={settings.required}
          icon={<Asterisk />}
          label="Required"
          onCheckedChange={(required) => onUpdate({ required })}
        />
      ) : null}
      <QuestionOptionSwitch
        checked={settings.descriptionEnabled}
        icon={<AlignLeft />}
        label="Description"
        onCheckedChange={(descriptionEnabled) =>
          onUpdate({ descriptionEnabled })
        }
      />
      {isTitle || type === "text" ? (
        <QuestionOptionSwitch
          checked={settings.longAnswer}
          icon={<ArrowLeftRight />}
          label="Long answer"
          onCheckedChange={(longAnswer) => onUpdate({ longAnswer })}
        />
      ) : null}

      <DropDrawerSeparator />
      <DropDrawerItem disabled>
        <PropertyIcon />
        <span className="min-w-0 flex-1">Question type</span>
        <span>{typeLabel}</span>
      </DropDrawerItem>
      <DropDrawerSub title="View linked property">
        <DropDrawerSubTrigger>
          <Database />
          <span className="min-w-0 flex-1">View linked property</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <div className="flex items-center gap-2 p-1.5">
            <PropertyIcon className="size-4 shrink-0 text-content-secondary" />
            <Input
              aria-label="Linked property name"
              className="h-8"
              defaultValue={propertyName}
              key={propertyName}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== propertyName) onLinkedPropertyRename(name)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <DropDrawerSeparator />
          <DropDrawerItem disabled>
            <ArrowLeftRight />
            <span className="min-w-0 flex-1">Type</span>
            <span>{typeLabel}</span>
          </DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <QuestionOptionSwitch
        checked={settings.syncWithPropertyName}
        icon={<ArrowLeftRight />}
        label="Sync with property name"
        onCheckedChange={(syncWithPropertyName) =>
          onUpdate({
            label: settings.label,
            syncWithPropertyName,
          })
        }
      />

      <DropDrawerSeparator />
      <DropDrawerSub title="Move question">
        <DropDrawerSubTrigger>
          <MoveVertical />
          <span className="min-w-0 flex-1">Move question</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-60">
          {!position.first ? (
            <>
              <DropDrawerItem onSelect={() => onMove("up")}>
                <ArrowUp />
                <span>Move up</span>
              </DropDrawerItem>
              <DropDrawerItem onSelect={() => onMove("top")}>
                <ArrowUpToLine />
                <span>Move to top of group</span>
              </DropDrawerItem>
            </>
          ) : null}
          {!position.last ? (
            <>
              <DropDrawerItem onSelect={() => onMove("down")}>
                <ArrowDown />
                <span>Move down</span>
              </DropDrawerItem>
              <DropDrawerItem onSelect={() => onMove("bottom")}>
                <ArrowDownToLine />
                <span>Move to bottom of group</span>
              </DropDrawerItem>
            </>
          ) : null}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerItem onSelect={onRemove} variant="destructive">
        <Trash2 />
        <span>Delete question</span>
      </DropDrawerItem>
    </DropDrawerContent>
  )
}

function QuestionOptionSwitch({
  checked,
  icon,
  label,
  onCheckedChange,
}: {
  checked: boolean
  icon: ReactNode
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <DropDrawerItem
      onSelect={(event) => {
        event.preventDefault()
        onCheckedChange(!checked)
      }}
    >
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(event) => event.stopPropagation()}
        size="sm"
      />
    </DropDrawerItem>
  )
}

function DatabaseFormPropertyControl({
  interactive,
  longAnswer,
  personOptions,
  property,
  required,
}: {
  interactive: boolean
  longAnswer: boolean
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  property: DatabaseProperty
  required: boolean
}) {
  const pageProperty = property.property
  const cellKind = getDatabasePropertyCellKind(pageProperty.type)
  const [value, setValue] = useState("")
  const [dateValue, setDateValue] = useState<string | string[]>("")
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const options = getFormOptions(
    pageProperty.type,
    pageProperty.config,
    personOptions,
  )
  const isMultipleChoice =
    pageProperty.type === "multi_select" ||
    (cellKind === "person" && getPersonLimit(pageProperty.config) !== "one_person")

  if (cellKind === "person") {
    return (
      <Select onValueChange={setValue} value={value || undefined}>
        <SelectTrigger
          aria-label={`${pageProperty.name} answer`}
          aria-required={required}
          className="w-full"
        >
          <SelectValue
            placeholder={interactive ? "Your answer" : "Respondent's answer"}
          />
        </SelectTrigger>
        <SelectContent align="start">
          {personOptions.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
              {person.suffix ? ` ${person.suffix}` : ""}
            </SelectItem>
          ))}
          {personOptions.length === 0 ? (
            <SelectItem disabled value="no-people">
              No people available
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    )
  }

  if (cellKind === "date") {
    const displayValue = formatDatabaseDateValue(
      dateValue,
      pageProperty.config,
    )

    return (
      <DatabasePropertyDate
        label={pageProperty.name}
        onSelect={setDateValue}
        propertyConfig={pageProperty.config}
        trigger={
          <Button
            aria-label={`${pageProperty.name} answer`}
            aria-required={required}
            className="w-full justify-between font-normal"
            type="button"
            variant="outline"
          >
            <span className={cn(!displayValue && "text-content-secondary")}>
              {displayValue ||
                (interactive ? "Your answer" : "Respondent's answer")}
            </span>
            <CalendarIcon className="text-content-secondary" />
          </Button>
        }
        value={dateValue}
      />
    )
  }

  if (cellKind === "select") {
    if (options.length === 0) {
      return (
        <p className="text-sm text-content-secondary">
          No options configured for this property.
        </p>
      )
    }

    if (isMultipleChoice) {
      return (
        <div aria-required={required} className="grid gap-3">
          {options.map((option) => {
            const checked = selectedValues.includes(option.id)

            return (
              <label
                className="flex cursor-pointer items-center gap-3 text-sm"
                key={option.id}
              >
                <Checkbox
                  aria-label={option.name}
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    setSelectedValues((current) =>
                      nextChecked === true
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                />
                <FormOptionLabel option={option} />
              </label>
            )
          })}
        </div>
      )
    }

    return (
      <RadioGroup
        aria-required={required}
        onValueChange={setValue}
        value={value}
      >
        {options.map((option) => (
          <label
            className="flex cursor-pointer items-center gap-3 text-sm"
            key={option.id}
          >
            <RadioGroupItem aria-label={option.name} value={option.id} />
            <FormOptionLabel option={option} />
          </label>
        ))}
      </RadioGroup>
    )
  }

  if (cellKind === "checkbox") {
    return (
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Checkbox
          aria-required={required}
          checked={value === "true"}
          onCheckedChange={(checked) => setValue(checked === true ? "true" : "")}
        />
        <span>Yes</span>
      </label>
    )
  }

  if (cellKind === "button") {
    return (
      <Button onClick={() => {}} type="button" variant="outline">
        {pageProperty.name}
      </Button>
    )
  }

  if (cellKind === "files") {
    return (
      <Input
        aria-label={`${pageProperty.name} answer`}
        required={required}
        type="file"
      />
    )
  }

  if (cellKind === "formula" || cellKind === "rollup") {
    return <Input placeholder="Calculated automatically" readOnly />
  }

  if (cellKind === "read_only_time" || pageProperty.type === "id") {
    return <Input placeholder="Generated automatically" readOnly />
  }

  if (cellKind === "relation") {
    return (
      <Button
        aria-required={required}
        className="w-full justify-start"
        type="button"
        variant="outline"
      >
        Select a page...
      </Button>
    )
  }

  const inputType =
    pageProperty.type === "number"
      ? "number"
      : pageProperty.type === "email"
        ? "email"
        : pageProperty.type === "phone"
          ? "tel"
        : pageProperty.type === "url"
          ? "url"
          : "text"

  if (longAnswer && pageProperty.type === "text") {
    return (
      <Textarea
        onChange={(event) => setValue(event.target.value)}
        placeholder={interactive ? "Your answer" : "Respondent's answer"}
        required={required}
        value={value}
      />
    )
  }

  return (
    <Input
      onChange={(event) => setValue(event.target.value)}
      placeholder={interactive ? "Your answer" : "Respondent's answer"}
      required={required}
      type={inputType}
      value={value}
    />
  )
}

function FormOptionLabel({ option }: { option: FormOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {option.color ? (
        <span
          aria-hidden
          className={getColorTokenDotClassName(option.color)}
        />
      ) : null}
      <span>{option.name}</span>
      {option.suffix ? (
        <span className="text-content-secondary">{option.suffix}</span>
      ) : null}
    </span>
  )
}

async function addFormPropertyOption(
  property: DatabaseProperty,
  updateDatabasePropertyConfig: (
    databasePropertyId: string,
    config: unknown,
  ) => Promise<unknown>,
) {
  const optionName = window.prompt("Option name")?.trim()

  if (!optionName) return

  const options = getFormOptions(
    property.property.type,
    property.property.config,
    [],
  )

  if (options.some((option) => option.name === optionName)) return

  const optionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `option-${Date.now()}`

  await updateDatabasePropertyConfig(property.id, {
    options: [
      ...options,
      {
        color: getNextDatabaseOptionColor(options.length),
        id: optionId,
        name: optionName,
      },
    ],
  })
}
