import type { CSSProperties, Dispatch, SetStateAction } from "react"
import type { PageLayoutConfig } from "@zilobase/features/pages"
import { usePageProperties } from "@zilobase/features/pages"

import { Checkbox } from "@/shared/ui/checkbox"

import { DatabasePropertyButton } from "../properties/editors/database-property-button"
import { DatabasePropertyDate } from "../properties/editors/database-property-date"
import { DatabasePropertyFiles } from "../properties/editors/database-property-files"
import { DatabasePropertyInput } from "../properties/editors/database-property-input"
import { DatabasePropertySelect } from "../properties/editors/database-property-select"
import { DatabaseRelationPropertyValue } from "../properties/editors/database-property-value"
import { formatDatabaseDateValue } from "../properties/model/database-date-config"
import { defaultStatusOptions, getDatabasePropertyType } from "../core/database-property-types"
import { getPersonLimit } from "../views/model/database-view-config"
import type { DatabasePresenceCollaborator } from "@zilobase/features/databases"
import type { DatabasePropertyValue } from "../core/database-property-values"

type PagePropertyPayload = ReturnType<typeof usePageProperties>["data"]
type PageProperty = NonNullable<PagePropertyPayload>["properties"][number]

function PagePropertyPresence({
  collaborators,
}: {
  collaborators: DatabasePresenceCollaborator[]
}) {
  if (collaborators.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className="database-cell-presence"
      title={collaborators.map((item) => item.user.name).join(", ")}
    >
      <span
        className="database-cell-presence-border"
        style={
          {
          "--database-presence-color": collaborators[0]?.color,
          } as CSSProperties
        }
      />
      <span className="database-cell-presence-stack">
        {collaborators.slice(0, 3).map((collaborator) => (
          <span
            className="database-cell-presence-dot"
            key={collaborator.sessionId}
            style={
              {
              "--database-presence-color": collaborator.color,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  )
}
export function PageMetadataProperties({
  draftValues,
  editable,
  layoutConfig,
  layoutPropertyId,
  onCommit,
  onDraftValuesChange,
  onOpenPage,
  onPropertyActive,
  pageId,
  personOptions,
  presenceByProperty,
  propertyPayload,
  propertyValues,
  title,
  visibleProperties,
}: {
  draftValues: Record<string, DatabasePropertyValue>
  editable: boolean
  layoutConfig?: PageLayoutConfig
  layoutPropertyId?: string
  onCommit: (propertyId: string, propertyType: string, value: DatabasePropertyValue) => void
  onDraftValuesChange: Dispatch<SetStateAction<Record<string, DatabasePropertyValue>>>
  onOpenPage?: (pageId: string) => void
  onPropertyActive: (propertyId: string, active: boolean) => void
  pageId?: string | null
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  presenceByProperty: Record<string, DatabasePresenceCollaborator[]>
  propertyPayload: PagePropertyPayload
  propertyValues: Record<string, DatabasePropertyValue>
  title: string
  visibleProperties: PageProperty[]
}) {
  const commitPropertyValue = onCommit
  const setDraftValues = onDraftValuesChange
  const setPropertyActive = onPropertyActive
  const propertyPresenceById = presenceByProperty

  return (
          <div className="mt-6 grid gap-1 py-2">
            {(layoutPropertyId
              ? (propertyPayload?.properties.filter(
                  (property) => property.id === layoutPropertyId,
                ) ?? [])
              : visibleProperties
            ).map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.type).icon
              const value =
                draftValues[property.id] ?? propertyValues[property.id] ?? ""
              const isSelectProperty =
                property.type === "select" ||
                property.type === "multi_select" ||
                property.type === "status"
              const isCheckboxProperty = property.type === "checkbox"
              const isButtonProperty = property.type === "button"
              const isDateProperty = property.type === "date"
              const isFilesProperty = property.type === "files"
              const isPersonProperty = property.type === "person"
              const isRelationProperty = property.type === "relation"
              const isReadOnlyTimeProperty =
                property.type === "created_time" ||
                property.type === "edited_time"
              const isMultiSelectProperty =
                property.type === "multi_select" ||
                (isPersonProperty &&
                  getPersonLimit(property.config) !== "one_person")
              const inputValue = Array.isArray(value) ? value.join(", ") : value

              return (
                <div
                  className="grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm"
                  key={property.id}
                >
                  <span className="flex min-w-0 items-center gap-2 text-content-secondary [&_svg]:size-4 [&_svg]:shrink-0">
                    {layoutConfig?.propertyIcons === false ? null : (
                      <PropertyIcon />
                    )}
                    <span className="truncate">{property.name}</span>
                  </span>
                  <div
                    className="relative min-w-0 rounded-xs"
                    data-presence={
                      (propertyPresenceById[property.id]?.length ?? 0) > 0
                        ? "true"
                        : undefined
                    }
                  >
                    <PagePropertyPresence
                      collaborators={propertyPresenceById[property.id] ?? []}
                    />
                    {isReadOnlyTimeProperty ? (
                      <span className="database-date-cell-trigger">
                        {formatDatabaseDateValue(value, property.config) || (
                          <span className="text-content-secondary">Empty</span>
                        )}
                      </span>
                    ) : isCheckboxProperty ? (
                      <div className="database-checkbox-cell px-0">
                        <Checkbox
                          aria-label={`${property.name} value`}
                          checked={value === "true"}
                          disabled={!editable}
                          onBlur={() => setPropertyActive(property.id, false)}
                          onCheckedChange={(nextChecked) =>
                            commitPropertyValue(
                              property.id,
                              property.type,
                              nextChecked === true ? "true" : "false",
                            )
                          }
                          onFocus={() => setPropertyActive(property.id, true)}
                        />
                      </div>
                    ) : isButtonProperty ? (
                      <DatabasePropertyButton
                        editable={editable}
                        label={property.name}
                        value={value}
                      />
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
                        emptyLabel="Empty"
                        label={property.name}
                        multiple={isMultiSelectProperty}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(
                            property.id,
                            property.type,
                            nextValue,
                          )
                        }
                        propertyConfig={property.config}
                        showStatusDot={property.type === "status"}
                        value={value}
                        valueKey={isPersonProperty ? "id" : "name"}
                      />
                    ) : isDateProperty ? (
                      <DatabasePropertyDate
                        editable={editable}
                        emptyLabel="Empty"
                        label={property.name}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(
                            property.id,
                            property.type,
                            nextValue,
                          )
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : isFilesProperty ? (
                      <DatabasePropertyFiles
                        editable={editable}
                        emptyLabel="Empty"
                        label={property.name}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(
                            property.id,
                            property.type,
                            nextValue,
                          )
                        }
                        propertyConfig={property.config}
                        value={value}
                      />
                    ) : isRelationProperty && pageId ? (
                      <DatabaseRelationPropertyValue
                        editable={editable}
                        emptyLabel="Empty"
                        label={property.name}
                        onOpen={onOpenPage}
                        onOpenChange={(open) =>
                          setPropertyActive(property.id, open)
                        }
                        onSelect={(nextValue) =>
                          commitPropertyValue(
                            property.id,
                            property.type,
                            nextValue,
                          )
                        }
                        propertyConfig={property.config}
                        row={{
                          createdAt: "",
                          id:
                            propertyPayload?.presenceTargets?.[0]?.rowId ??
                            pageId,
                          page: { id: pageId, name: title },
                          pageId,
                          updatedAt: "",
                        }}
                        value={value}
                        wrapContent
                      />
                    ) : (
                      <DatabasePropertyInput
                        editable={editable}
                        emptyLabel="Empty"
                        label={property.name}
                        onActivate={() => setPropertyActive(property.id, true)}
                        onChange={(nextValue) =>
                          setDraftValues((drafts) => ({
                            ...drafts,
                            [property.id]: nextValue,
                          }))
                        }
                        onCommit={() =>
                          commitPropertyValue(
                            property.id,
                            property.type,
                            inputValue,
                          )
                        }
                        onDeactivate={() =>
                          setPropertyActive(property.id, false)
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
  )
}
