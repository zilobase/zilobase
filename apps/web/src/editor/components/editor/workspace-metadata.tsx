import { useEffect, useMemo, useRef, useState } from "react"
import {
  ImagePlus,
  SmilePlus,
  X,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSession } from "@notelab/features/auth"
import {
  useUpdateWorkspacePropertyValue,
  useWorkspacePersonAccessTargets,
  useWorkspaceProperties,
} from "@notelab/features/workspaces"

import { DatabasePropertyDate } from "../../extensions/database/database-property-date"
import { DatabasePropertyFiles } from "../../extensions/database/database-property-files"
import { DatabasePropertyInput } from "../../extensions/database/database-property-input"
import { DatabasePropertySelect } from "../../extensions/database/database-property-select"
import { getDatabasePropertyType } from "../../extensions/database/constants"
import { defaultStatusOptions } from "../../extensions/database/constants"
import { formatDatabaseDateValue } from "../../extensions/database/table/database-date-config"
import { getPersonLimit } from "../../extensions/database/table/database-column-config"
import {
  type DatabasePropertyValue,
  parsePropertyValue,
  serializePropertyValue,
} from "../../extensions/database/utils"

type WorkspaceMetadataProps = {
  contentClassName?: string
  editable?: boolean
  icon?: string
  onIconChange?: (icon: string) => void
  onTitleChange?: (title: string) => void
  title?: string
  workspaceId?: string | null
}

export function WorkspaceMetadata({
  contentClassName,
  editable = true,
  icon: iconProp,
  onIconChange,
  onTitleChange,
  title: titleProp,
  workspaceId,
}: WorkspaceMetadataProps) {
  const [coverVisible, setCoverVisible] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [localIcon, setLocalIcon] = useState("")
  const [localTitle, setLocalTitle] = useState("")
  const [draftValues, setDraftValues] = useState<Record<string, DatabasePropertyValue>>({})
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const { data: propertyPayload } = useWorkspaceProperties(workspaceId)
  const { data: accessTargets } = useWorkspacePersonAccessTargets(workspaceId)
  const { data: session } = useSession()
  const updatePropertyValue = useUpdateWorkspacePropertyValue()
  const icon = iconProp ?? localIcon
  const title = titleProp ?? localTitle
  const propertyValues = useMemo(() => {
    const values: Record<string, DatabasePropertyValue> = {}

    for (const value of propertyPayload?.values ?? []) {
      const property = propertyPayload?.properties.find(
        (item) => item.id === value.propertyId
      )
      values[value.propertyId] = parsePropertyValue(value.value, property?.type)
    }

    return values
  }, [propertyPayload?.properties, propertyPayload?.values])
  const personOptions = useMemo(
    () =>
      (accessTargets?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name || member.email,
        suffix: member.id === session?.user?.id ? "(you)" : undefined,
      })),
    [accessTargets?.members, session?.user?.id]
  )

  const commitPropertyValue = (
    propertyId: string,
    propertyType: string,
    value: DatabasePropertyValue
  ) => {
    if (!workspaceId || !editable) {
      return
    }

    setDraftValues((drafts) => ({
      ...drafts,
      [propertyId]: value,
    }))

    updatePropertyValue.mutate(
      {
        propertyId,
        value: serializePropertyValue(propertyType, value),
        workspaceId,
      },
      {
        onSuccess: () => {
          setDraftValues((drafts) => {
            const nextDrafts = { ...drafts }

            delete nextDrafts[propertyId]

            return nextDrafts
          })
        },
      }
    )
  }

  const updateIcon = (nextIcon: string) => {
    if (!editable) {
      return
    }

    onIconChange?.(nextIcon)

    if (iconProp === undefined) {
      setLocalIcon(nextIcon)
    }
  }

  const updateTitle = (nextTitle: string) => {
    if (!editable) {
      return
    }

    onTitleChange?.(nextTitle)

    if (titleProp === undefined) {
      setLocalTitle(nextTitle)
    }
  }

  useEffect(() => {
    const titleElement = titleRef.current

    if (!titleElement) {
      return
    }

    titleElement.style.height = "0px"
    titleElement.style.height = `${titleElement.scrollHeight}px`
  }, [title])

  const iconPicker = icon && editable ? (
    <div className="group/icon relative shrink-0">
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Change workspace icon"
            className="flex size-11 items-center justify-center rounded-md text-3xl transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            disabled={!editable}
            type="button"
          >
            {icon}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto gap-0 overflow-hidden p-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          sideOffset={6}
        >
          <EmojiPicker
            onEmojiSelect={({ emoji }) => {
              updateIcon(emoji)
              setIconOpen(false)
            }}
          >
            <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>
      <button
        aria-label="Remove workspace icon"
        className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-hover/icon:flex [&_svg]:size-3"
        onClick={() => {
          updateIcon("")
          setIconOpen(false)
        }}
        disabled={!editable}
        type="button"
      >
        <X />
      </button>
    </div>
  ) : !icon && editable ? (
    <Popover open={iconOpen} onOpenChange={setIconOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
          disabled={!editable}
          type="button"
        >
          <SmilePlus />
          Add icon
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-0 overflow-hidden p-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <EmojiPicker
          onEmojiSelect={({ emoji }) => {
            updateIcon(emoji)
            setIconOpen(false)
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  ) : null

  return (
    <section contentEditable={false}>
      {coverVisible ? (
        <div className="relative h-40 bg-gradient-to-r from-stone-200 via-neutral-300 to-zinc-200 dark:from-stone-800 dark:via-neutral-700 dark:to-zinc-800">
          <button
            aria-label="Remove cover"
            className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
            onClick={() => setCoverVisible(false)}
            disabled={!editable}
            type="button"
          >
            <X />
          </button>
        </div>
      ) : null}

      <div
        className={`${contentClassName ?? ""} px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!icon ? iconPicker : null}
          {!coverVisible && editable ? (
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
              onClick={() => setCoverVisible(true)}
              disabled={!editable}
              type="button"
            >
              <ImagePlus />
              Add cover
            </button>
          ) : null}
        </div>

        <div className="flex items-start gap-3">
          {icon ? (
            editable ? (
              iconPicker
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md text-3xl">
                {icon}
              </div>
            )
          ) : null}
          <textarea
            aria-label="Workspace title"
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-4xl font-semibold leading-tight tracking-normal whitespace-pre-wrap text-balance text-foreground shadow-none outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 dark:bg-transparent"
            onChange={(event) => updateTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            placeholder="New workspace"
            readOnly={!editable}
            ref={titleRef}
            rows={1}
            value={title}
          />
        </div>

        {propertyPayload?.properties.length ? (
          <div className="mt-6 grid gap-1 border-y py-2">
            {propertyPayload.properties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.type).icon
              const value =
                draftValues[property.id] ?? propertyValues[property.id] ?? ""
              const isSelectProperty =
                property.type === "select" ||
                property.type === "multi_select" ||
                property.type === "status"
              const isCheckboxProperty = property.type === "checkbox"
              const isDateProperty = property.type === "date"
              const isFilesProperty = property.type === "files"
              const isPersonProperty = property.type === "person"
              const isReadOnlyTimeProperty =
                property.type === "created_time" || property.type === "edited_time"
              const isMultiSelectProperty =
                property.type === "multi_select" ||
                (isPersonProperty && getPersonLimit(property.config) !== "one_person")
              const inputValue = Array.isArray(value) ? value.join(", ") : value

              return (
                <div
                  className="grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm"
                  key={property.id}
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
                    <PropertyIcon />
                    <span className="truncate">{property.name}</span>
                  </span>
                  <div className="min-w-0">
                    {isReadOnlyTimeProperty ? (
                      <span className="database-date-cell-trigger">
                        {formatDatabaseDateValue(value, property.config) || (
                          <span className="text-muted-foreground">Empty</span>
                        )}
                      </span>
                    ) : isCheckboxProperty ? (
                      <div className="database-checkbox-cell px-0">
                        <Checkbox
                          aria-label={`${property.name} value`}
                          checked={value === "true"}
                          disabled={!editable}
                          onCheckedChange={(nextChecked) =>
                            commitPropertyValue(
                              property.id,
                              property.type,
                              nextChecked === true ? "true" : "false"
                            )
                          }
                        />
                      </div>
                    ) : isSelectProperty || isPersonProperty ? (
                      <DatabasePropertySelect
                        allowCreate={false}
                        defaultOptions={
                          property.type === "status"
                            ? defaultStatusOptions
                            : isPersonProperty
                              ? personOptions
                              : undefined
                        }
                        editable={editable}
                        label={property.name}
                        multiple={isMultiSelectProperty}
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        showStatusDot={property.type === "status"}
                        value={value}
                        valueKey={isPersonProperty ? "id" : "name"}
                      />
                    ) : isDateProperty ? (
                      <DatabasePropertyDate
                        editable={editable}
                        label={property.name}
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : isFilesProperty ? (
                      <DatabasePropertyFiles
                        editable={editable}
                        label={property.name}
                        onSelect={(nextValue) =>
                          commitPropertyValue(property.id, property.type, nextValue)
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : (
                      <DatabasePropertyInput
                        editable={editable}
                        label={property.name}
                        onChange={(nextValue) =>
                          setDraftValues((drafts) => ({
                            ...drafts,
                            [property.id]: nextValue,
                          }))
                        }
                        onCommit={() =>
                          commitPropertyValue(property.id, property.type, inputValue)
                        }
                        propertyConfig={property.config}
                        type={property.type}
                        value={inputValue}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
