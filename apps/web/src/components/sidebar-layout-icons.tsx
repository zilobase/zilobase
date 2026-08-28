import {
  BotIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CircleDashedIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  Layers3Icon,
  ListIcon,
  ListChecksIcon,
  LockIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"

import type { LibraryView, SidebarShortcut, SidebarTabIconId } from "@zilobase/features/user-settings"
import { PageIconDisplay } from "@/lib/page-icon"

export const libraryViewIcons = {
  favourites: StarIcon,
  meetings: CalendarDaysIcon,
  private: LockIcon,
  recents: HistoryIcon,
  shared: UsersIcon,
  teamspaces: Layers3Icon,
} satisfies Record<LibraryView, typeof HistoryIcon>

export const sidebarTabIcons = {
  briefcase: BriefcaseIcon,
  calendar: CalendarDaysIcon,
  circle: CircleDashedIcon,
  database: DatabaseIcon,
  folder: FolderIcon,
  home: HomeIcon,
  list: ListIcon,
  sparkles: SparklesIcon,
  star: StarIcon,
} satisfies Record<SidebarTabIconId, typeof HomeIcon>

export function SidebarTabIcon({ value }: { value: string }) {
  const Icon = sidebarTabIcons[value as SidebarTabIconId]
  return Icon ? (
    <Icon aria-hidden="true" className="size-4" />
  ) : (
    <PageIconDisplay className="pointer-events-none" size="sm" value={value} />
  )
}

export function SidebarShortcutIcon({ shortcut }: { shortcut: SidebarShortcut }) {
  if (shortcut.icon) return <SidebarTabIcon value={shortcut.icon} />

  const Icon = getDefaultShortcutIcon(shortcut.target)
  return <Icon aria-hidden="true" className="size-4" />
}

function getDefaultShortcutIcon(target: SidebarShortcut["target"]) {
  if (target.type === "action") {
    return target.action === "createPage"
      ? FileIcon
      : target.action === "createDatabase"
        ? DatabaseIcon
        : BotIcon
  }
  if (target.type === "page") return FileIcon
  if (target.type === "database") return DatabaseIcon
  if (target.type === "library") return libraryViewIcons[target.view]
  return {
    ai: SparklesIcon,
    meetings: CalendarDaysIcon,
    settings: SettingsIcon,
    tasks: ListChecksIcon,
    trash: Trash2Icon,
  }[target.route]
}
