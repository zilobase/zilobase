import { useMemo, type ReactNode } from "react"
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LockKeyhole,
  PanelRight,
  Pin,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { getDatabasePropertyType } from "@/packages/editor/extensions/database/core/database-property-types"
import type { DatabasePayload } from "@notelab/features/databases"
import {
  canMovePageLayoutModuleToRegion,
  movePageLayoutModule,
  type PageLayoutConfig,
  type PageLayoutModuleType,
  type PageLayoutPropertyDisplay,
  type PageLayoutRegion,
} from "@notelab/features/pages"

type LayoutEditorSettingsProps = {
  draft: PageLayoutConfig
  fullWidth: boolean
  fullWidthPending?: boolean
  onChange: (draft: PageLayoutConfig) => void
  onFullWidthChange: (fullWidth: boolean) => void
  properties: DatabasePayload["properties"]
}

function SettingsSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function SettingToggle({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-9 items-center gap-3 text-sm">
      <span className="flex-1">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </label>
  )
}

function formatModuleLabel(type: PageLayoutModuleType) {
  return type
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

export function LayoutEditorSettings({
  draft,
  fullWidth,
  fullWidthPending = false,
  onChange,
  onFullWidthChange,
  properties,
}: LayoutEditorSettingsProps) {
  const orderedProperties = useMemo(
    () =>
      [...properties].sort((left, right) => {
        const leftIndex = draft.propertyOrder.indexOf(left.property.id)
        const rightIndex = draft.propertyOrder.indexOf(right.property.id)
        return (
          (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        )
      }),
    [draft.propertyOrder, properties],
  )

  const moveModuleToRegion = (moduleId: string, region: PageLayoutRegion) => {
    onChange(movePageLayoutModule(draft, moduleId, { region }))
  }

  const moveModuleBy = (moduleId: string, offset: -1 | 1) => {
    const module = draft.modules.find((item) => item.id === moduleId)
    if (!module) return

    const regionModules = draft.modules.filter(
      (item) => item.region === module.region,
    )
    const currentIndex = regionModules.findIndex((item) => item.id === moduleId)
    const targetIndex = currentIndex + offset
    const target = regionModules[targetIndex]
    if (!target) return

    const beforeModuleId =
      offset < 0 ? target.id : regionModules[targetIndex + 1]?.id
    onChange(
      movePageLayoutModule(draft, moduleId, {
        ...(beforeModuleId ? { beforeModuleId } : {}),
        region: module.region,
      }),
    )
  }

  const movePropertyBy = (propertyIndex: number, offset: -1 | 1) => {
    const order = orderedProperties.map((entry) => entry.property.id)
    const targetIndex = propertyIndex + offset
    ;[order[propertyIndex], order[targetIndex]] = [
      order[targetIndex],
      order[propertyIndex],
    ]
    onChange({ ...draft, propertyOrder: order })
  }

  return (
    <aside className="w-[min(22rem,100vw)] shrink-0 overflow-y-auto border-l bg-background p-5">
      <h2 className="text-lg font-semibold">Page settings</h2>

      <SettingsSection title="Structure">
        <div className="grid grid-cols-2 gap-2">
          {(["simple", "tabbed"] as const).map((structure) => (
            <button
              className={cn(
                "rounded-lg border p-3 text-left capitalize",
                draft.structure === structure &&
                  "border-primary bg-primary/5 ring-1 ring-primary",
              )}
              key={structure}
              onClick={() => onChange({ ...draft, structure })}
              type="button"
            >
              <div className="mb-2 h-12 rounded border bg-muted/50" />
              <span className="text-sm font-medium">{structure}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Options">
        <SettingToggle
          checked={draft.propertyIcons}
          label="Property icons"
          onCheckedChange={(propertyIcons) =>
            onChange({ ...draft, propertyIcons })
          }
        />
        <SettingToggle
          checked={draft.discussionsVisible}
          label="Page discussions"
          onCheckedChange={(discussionsVisible) =>
            onChange({ ...draft, discussionsVisible })
          }
        />
        <SettingToggle
          checked={fullWidth}
          label="Full width"
          onCheckedChange={onFullWidthChange}
          disabled={fullWidthPending}
        />
      </SettingsSection>

      <SettingsSection title="Modules">
        <div className="space-y-1">
          {draft.modules.map((module) => {
            const regionModules = draft.modules.filter(
              (item) => item.region === module.region,
            )
            const moduleIndex = regionModules.findIndex(
              (item) => item.id === module.id,
            )
            const fixed = module.type === "heading"
            const anchored =
              module.type === "property_group" && module.region === "main"
            const targetRegion =
              module.region === "panel" ? "main" : "panel"
            const canMoveToTarget = canMovePageLayoutModuleToRegion(
              module,
              targetRegion,
            )

            return (
              <div
                className="flex min-h-9 items-center gap-1 rounded-md border px-2"
                key={module.id}
              >
                {fixed ? (
                  <LockKeyhole className="size-4 text-muted-foreground" />
                ) : (
                  <GripVertical className="size-4 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {formatModuleLabel(module.type)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    · {fixed ? "fixed" : anchored ? "below heading" : module.region}
                  </span>
                </span>
                <Button
                  aria-label="Move module up"
                  disabled={fixed || anchored || moduleIndex === 0}
                  onClick={() => moveModuleBy(module.id, -1)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ChevronUp />
                </Button>
                <Button
                  aria-label="Move module down"
                  disabled={
                    fixed || anchored || moduleIndex === regionModules.length - 1
                  }
                  onClick={() => moveModuleBy(module.id, 1)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ChevronDown />
                </Button>
                <Button
                  aria-label={
                    module.region === "panel"
                      ? "Move module to main page"
                      : "Move module to details panel"
                  }
                  className={cn(module.region === "panel" && "bg-accent")}
                  disabled={fixed || !canMoveToTarget}
                  onClick={() =>
                    moveModuleToRegion(module.id, targetRegion)
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <PanelRight />
                </Button>
              </div>
            )
          })}
        </div>
      </SettingsSection>

      {orderedProperties.length ? (
        <SettingsSection title="Properties">
          <div className="space-y-1">
            {orderedProperties.map((item, propertyIndex) => {
              const property = item.property
              const Icon = getDatabasePropertyType(property.type).icon
              const setting = draft.propertySettings[property.id] ?? {
                display: "always" as const,
              }
              const pinned = draft.pinnedPropertyIds.includes(property.id)
              const standalone = draft.modules.some(
                (module) =>
                  module.type === "property" &&
                  module.propertyId === property.id,
              )

              return (
                <div className="rounded-md border p-2" key={property.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {property.name}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Select
                      onValueChange={(display: PageLayoutPropertyDisplay) =>
                        onChange({
                          ...draft,
                          propertySettings: {
                            ...draft.propertySettings,
                            [property.id]: { ...setting, display },
                          },
                        })
                      }
                      value={setting.display}
                    >
                      <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Always</SelectItem>
                        <SelectItem value="hide_when_empty">Hide empty</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      aria-label="Move property up"
                      disabled={propertyIndex === 0}
                      onClick={() => movePropertyBy(propertyIndex, -1)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      aria-label="Move property down"
                      disabled={propertyIndex === orderedProperties.length - 1}
                      onClick={() => movePropertyBy(propertyIndex, 1)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      aria-label={
                        pinned
                          ? "Unpin property"
                          : "Pin property to heading"
                      }
                      className={cn(pinned && "bg-accent")}
                      onClick={() =>
                        onChange({
                          ...draft,
                          pinnedPropertyIds: pinned
                            ? draft.pinnedPropertyIds.filter(
                                (id) => id !== property.id,
                              )
                            : [...draft.pinnedPropertyIds, property.id],
                        })
                      }
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pin />
                    </Button>
                    <Button
                      aria-label={
                        standalone
                          ? "Return property to group"
                          : "Make standalone property"
                      }
                      className={cn(standalone && "bg-accent")}
                      onClick={() =>
                        onChange({
                          ...draft,
                          modules: standalone
                            ? draft.modules.filter(
                                (module) =>
                                  !(
                                    module.type === "property" &&
                                    module.propertyId === property.id
                                  ),
                              )
                            : [
                                ...draft.modules,
                                {
                                  id: `property-${property.id}`,
                                  propertyId: property.id,
                                  region: "main",
                                  type: "property",
                                },
                              ],
                        })
                      }
                      size="icon-sm"
                      variant="ghost"
                    >
                      <PanelRight />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </SettingsSection>
      ) : null}
    </aside>
  )
}
