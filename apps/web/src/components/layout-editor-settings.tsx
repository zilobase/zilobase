import type { ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { PageLayoutConfig } from "@notelab/features/pages"

type LayoutEditorSettingsProps = {
  draft: PageLayoutConfig
  fullWidth: boolean
  fullWidthPending?: boolean
  onChange: (draft: PageLayoutConfig) => void
  onDiscussionsVisibleChange: (visible: boolean) => void
  onFullWidthChange: (fullWidth: boolean) => void
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

export function LayoutEditorSettings({
  draft,
  fullWidth,
  fullWidthPending = false,
  onChange,
  onDiscussionsVisibleChange,
  onFullWidthChange,
}: LayoutEditorSettingsProps) {
  return (
    <aside className="w-[min(22rem,100vw)] shrink-0 overflow-y-auto border-r bg-background p-5">
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
          onCheckedChange={onDiscussionsVisibleChange}
        />
        <SettingToggle
          checked={fullWidth}
          label="Full width"
          onCheckedChange={onFullWidthChange}
          disabled={fullWidthPending}
        />
      </SettingsSection>
    </aside>
  )
}
