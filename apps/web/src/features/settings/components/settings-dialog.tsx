import type { ReactNode } from "react"

import { SettingsSidebar, type SettingsSection } from "./settings-sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog"

export function SettingsDialog({
  activeSection,
  children,
  onOpenChange,
  onSectionChange,
  open,
}: {
  activeSection: SettingsSection
  children: ReactNode
  onOpenChange: (open: boolean) => void
  onSectionChange: (section: SettingsSection) => void
  open: boolean
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(820px,calc(100svh-2rem))] gap-0 overflow-hidden p-0 sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:grid-cols-[16rem_minmax(0,1fr)]"
        hideMobileDragHandle
        overlayClassName="bg-scrim backdrop-blur-[1px]"
        unstyledContent
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account and workspace settings.
        </DialogDescription>
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
