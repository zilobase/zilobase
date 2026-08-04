import {
  BookOpenIcon,
  CalendarIcon,
  EyeIcon,
  EyeOffIcon,
  HelpCircleIcon,
  LockIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
  BlocksIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  SidebarConfig,
  SidebarItemId,
} from "@zilobase/features/user-settings"

const fixedItems: Array<{
  icon: typeof BookOpenIcon
  id: SidebarItemId
  label: string
}> = [
  { icon: BookOpenIcon, id: "library", label: "Library" },
  { icon: SparklesIcon, id: "askAi", label: "Ask AI" },
  { icon: CalendarIcon, id: "calendar", label: "Calendar" },
  { icon: BlocksIcon, id: "templates", label: "Templates" },
  { icon: Trash2Icon, id: "trash", label: "Trash" },
  { icon: HelpCircleIcon, id: "help", label: "Help" },
]

const sectionDetails = {
  favorites: { icon: StarIcon, label: "Favorites" },
  private: { icon: LockIcon, label: "Private" },
  shared: { icon: UsersIcon, label: "Shared" },
} as const

export function SidebarCustomizeDialog({
  config,
  disabled,
  onChange,
  onOpenChange,
  open,
}: {
  config: SidebarConfig
  disabled?: boolean
  onChange: (config: SidebarConfig) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const items = [
    ...fixedItems.slice(0, 2),
    ...config.sectionOrder.map((id) => ({ id, ...sectionDetails[id] })),
    ...fixedItems.slice(2),
  ]

  const toggleItem = (itemId: SidebarItemId) => {
    const hidden = config.hiddenItems.includes(itemId)
    onChange({
      ...config,
      hiddenItems: hidden
        ? config.hiddenItems.filter((id) => id !== itemId)
        : [...config.hiddenItems, itemId],
    })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize sidebar</DialogTitle>
          <DialogDescription>
            Choose what appears in your sidebar. These preferences are saved to
            your account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 py-1">
          {items.map((item, index) => {
            const Icon = item.icon
            const visible = !config.hiddenItems.includes(item.id)

            return (
              <div key={item.id}>
                {index === 2 || index === 5 ? (
                  <div className="my-2 h-px bg-border" />
                ) : null}
                <button
                  aria-pressed={visible}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent disabled:opacity-60"
                  disabled={disabled}
                  onClick={() => toggleItem(item.id)}
                  type="button"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {visible ? (
                    <EyeIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <EyeOffIcon className="size-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
        <DialogFooter className="sm:justify-stretch">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
