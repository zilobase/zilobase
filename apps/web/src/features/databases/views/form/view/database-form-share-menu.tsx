import {
  Check,
  ChevronRight,
  CircleUserRound,
  FileLock2,
  Link2,
  Share2,
  UserRoundCheck,
} from "@/shared/components/icons"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { Input } from "@/shared/ui/input"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"

import { useDatabaseViewContext } from "../../model/database-view-context"
import {
  getDatabaseFormShareSettings,
  type DatabaseFormFillAccess,
  type DatabaseFormSubmissionAccess,
} from "../model/database-form-share-config"

const fillAccessLabels: Record<DatabaseFormFillAccess, string> = {
  workspace: "Anyone in this workspace with link",
  public: "Anyone on the web with link",
  closed: "No access",
}

const submissionAccessLabels: Record<DatabaseFormSubmissionAccess, string> = {
  none: "No access",
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  full: "Full access",
}
const submissionAccessValues: DatabaseFormSubmissionAccess[] = [
  "none",
  "view",
  "comment",
  "edit",
  "full",
]

export function DatabaseFormShareMenu() {
  const {
    activeView,
    databaseId,
    updateDatabaseFormShareSettings,
  } = useDatabaseViewContext()
  const [settings, setSettings] = useState(() =>
    getDatabaseFormShareSettings(activeView?.config),
  )
  useEffect(() => {
    setSettings(getDatabaseFormShareSettings(activeView?.config))
  }, [activeView?.config, activeView?.id])
  const updateSettings = (patch: Partial<typeof settings>) => {
    setSettings((currentSettings) => ({ ...currentSettings, ...patch }))
    updateDatabaseFormShareSettings?.(patch)
  }
  const formLink = useMemo(() => {
    if (typeof window === "undefined" || !databaseId) return ""

    const url = new URL(`/d/${databaseId}`, window.location.origin)

    if (activeView?.id) url.searchParams.set("view", activeView.id)

    return url.toString()
  }, [activeView?.id, databaseId])
  const copyFormLink = async () => {
    try {
      await navigator.clipboard.writeText(formLink || window.location.href)
      toast.success("Form link copied.")
    } catch {
      toast.error("Couldn't copy the form link.")
    }
  }

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Share form"
          className="h-8 gap-1.5 px-3"
          disabled={!databaseId || !updateDatabaseFormShareSettings}
          type="button"
        >
          <Share2 />
          <span>Share</span>
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="end"
        className="w-[min(31rem,calc(100vw-1rem))] p-2"
      >
        <DropDrawerSub title="Who can fill out">
          <DropDrawerSubTrigger>
            <ShareMenuRow
              icon={<CircleUserRound />}
              label="Who can fill out"
              value={fillAccessLabels[settings.fillAccess]}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-80">
            <FillAccessItem
              activeValue={settings.fillAccess}
              label="Anyone in this workspace with link"
              onSelect={(fillAccess) => updateSettings({ fillAccess })}
              value="workspace"
            />
            <FillAccessItem
              activeValue={settings.fillAccess}
              badge="Public"
              label="Anyone on the web with link"
              onSelect={(fillAccess) => updateSettings({ fillAccess })}
              value="public"
            />
            <FillAccessItem
              activeValue={settings.fillAccess}
              badge="Closed"
              label="No access"
              onSelect={(fillAccess) => updateSettings({ fillAccess })}
              value="closed"
            />
          </DropDrawerSubContent>
        </DropDrawerSub>

        <div
          aria-checked={settings.anonymousResponses}
          className="my-0.5 flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-[13px] text-content-primary outline-hidden select-none hover:bg-action-neutral-hover focus-visible:bg-action-neutral-hover [&_svg]:shrink-0"
          onClick={() =>
            updateSettings({
              anonymousResponses: !settings.anonymousResponses,
            })
          }
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return

            event.preventDefault()
            updateSettings({
              anonymousResponses: !settings.anonymousResponses,
            })
          }}
          role="menuitemcheckbox"
          tabIndex={0}
        >
          <UserRoundCheck className="size-4 shrink-0 text-content-secondary" />
          <span className="min-w-0 flex-1">Anonymous responses</span>
          <Switch
            aria-label="Allow anonymous responses"
            checked={settings.anonymousResponses}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(anonymousResponses) =>
              updateSettings({ anonymousResponses })
            }
          />
        </div>

        {settings.anonymousResponses ? (
          <DropDrawerItem disabled>
            <FileLock2 />
            <span className="min-w-0 flex-1">Access to submission</span>
            <span className="truncate text-content-secondary">
              {submissionAccessLabels[settings.submissionAccess]}
            </span>
            <ChevronRight />
          </DropDrawerItem>
        ) : (
          <DropDrawerSub title="Access to submission">
            <DropDrawerSubTrigger>
              <ShareMenuRow
                icon={<FileLock2 />}
                label="Access to submission"
                value={submissionAccessLabels[settings.submissionAccess]}
              />
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-64">
              {submissionAccessValues.map((submissionAccess) => (
                <DropDrawerItem
                  key={submissionAccess}
                  onSelect={() => updateSettings({ submissionAccess })}
                >
                  <span className="min-w-0 flex-1">
                    {submissionAccessLabels[submissionAccess]}
                  </span>
                  {settings.submissionAccess === submissionAccess ? (
                    <Check className="text-content-primary" />
                  ) : null}
                </DropDrawerItem>
              ))}
            </DropDrawerSubContent>
          </DropDrawerSub>
        )}

        <div className="mt-2 flex min-w-0 items-center rounded-md border bg-surface-canvas">
          <Input
            aria-label="Form link"
            className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            readOnly
            value={formLink}
          />
          <Button
            className="h-9 shrink-0 rounded-l-none border-y-0 border-r-0"
            onClick={() => void copyFormLink()}
            type="button"
            variant="outline"
          >
            <Link2 />
            Copy form link
          </Button>
        </div>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function ShareMenuRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon}
      <span className="shrink-0">{label}</span>
      <span className="ml-auto max-w-60 truncate text-content-secondary">
        {value}
      </span>
    </div>
  )
}

function FillAccessItem({
  activeValue,
  badge,
  label,
  onSelect,
  value,
}: {
  activeValue: DatabaseFormFillAccess
  badge?: string
  label: string
  onSelect: (value: DatabaseFormFillAccess) => void
  value: DatabaseFormFillAccess
}) {
  return (
    <DropDrawerItem onSelect={() => onSelect(value)}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <Badge
          className={cn(
            "font-normal",
            value === "public"
              ? "bg-feedback-warning-subtle text-feedback-warning-text"
              : "bg-surface-muted text-content-secondary",
          )}
          variant="secondary"
        >
          {badge}
        </Badge>
      ) : null}
      {activeValue === value ? <Check className="text-content-primary" /> : null}
    </DropDrawerItem>
  )
}
